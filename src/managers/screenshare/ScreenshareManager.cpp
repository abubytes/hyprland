#include "ScreenshareManager.hpp"
#include "../../render/Renderer.hpp"
#include "../../Compositor.hpp"
#include "../../desktop/view/window/Window.hpp"
#include "../../protocols/core/Seat.hpp"
#include "../../event/EventBus.hpp"
#include "../../state/MonitorState.hpp"
#include "WorkspaceCaptureSource.hpp"
#include "../permissions/DynamicPermissionManager.hpp"
#include "hyprland-workspace-image-capture-source-v1.hpp"

using namespace Screenshare;

static bool isSameCommittedOutput(PHLMONITOR sessionMonitor, PHLMONITOR commitMonitor) {
    if (!sessionMonitor || !commitMonitor)
        return false;

    if (sessionMonitor == commitMonitor)
        return true;

    const auto SESSIONPHYSICAL = sessionMonitor->physicalMonitor();
    const auto COMMITPHYSICAL  = commitMonitor->physicalMonitor();

    return SESSIONPHYSICAL && COMMITPHYSICAL && SESSIONPHYSICAL == COMMITPHYSICAL;
}

CScreenshareManager::CScreenshareManager() {
    m_monitorPreRemovedListener = Event::bus()->m_events.monitor.preRemoved.listen([this](PHLMONITOR monitor) { stopSessionsForMonitor(monitor); });
}

void CScreenshareManager::onOutputCommit(PHLMONITOR monitor, bool copyFBPrepared) {
    // user intent -> strategy: never copy a screenshare frame while the session/seat is inactive
    // (VT switch, suspend, mid-hotplug connector rescan). During those windows the GPU/EGL state is
    // being torn down and importing the client dmabuf into an EGL image fails, which previously
    // crashed in the renderbuffer teardown. Mirror the same guard the renderer uses before
    // scheduling any frame (see CCompositor::scheduleFrameForMonitor). m_sessionActive mirrors
    // session->active, so checking the aq session alone is equivalent and keeps sessionless
    // backends (headless / tests) copying.
    if (g_pCompositor->m_aqBackend && g_pCompositor->m_aqBackend->hasSession() && !g_pCompositor->m_aqBackend->session->active)
        return;

    std::erase_if(m_sessions, [&](const WP<CScreenshareSession>& session) { return session.expired(); });

    if (!m_pendingFrames.empty())
        LOG(Log::TRACE, "[SSDBG] outputCommit mon={} id={} virt={} physical={} pending={} sessions={}", monitor ? monitor->m_name : "<none>", monitor ? monitor->m_id : -1,
            monitor ? monitor->isVirtual() : false, monitor && monitor->physicalMonitor() ? monitor->physicalMonitor()->m_name : "<none>", m_pendingFrames.size(),
            m_sessions.size());

    // if no pending frames, and no sessions are sharing, then unblock ds
    if (m_pendingFrames.empty()) {
        for (const auto& session : m_sessions) {
            if (!session->m_stopped && session->m_sharing)
                return;
        }

        return; // nothing to share
    }

    std::ranges::for_each(m_pendingFrames, [&](WP<CScreenshareFrame>& frame) {
        if (frame.expired()) {
            LOG(Log::TRACE, "[SSDBG] outputCommit skip expired frame commitMon={}", monitor ? monitor->m_name : "<none>");
            return;
        }

        const bool FRAME_DONE = frame->done();
        if (!frame->m_shared || FRAME_DONE) {
            LOG(Log::TRACE, "[SSDBG] outputCommit skip frame commitMon={} shared={} done={} copied={} failed={}", monitor ? monitor->m_name : "<none>", frame->m_shared, FRAME_DONE,
                frame->m_copied, frame->m_failed);
            return;
        }

        const auto SESSIONMONITOR = frame->m_session->monitor();
        const bool MATCH          = isSameCommittedOutput(SESSIONMONITOR, monitor);
        LOG(Log::TRACE, "[SSDBG] outputCommit consider commitMon={} sessionMon={} sessionPhys={} match={} type={} damage={} {} {} {}", monitor ? monitor->m_name : "<none>",
            SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>", SESSIONMONITOR && SESSIONMONITOR->physicalMonitor() ? SESSIONMONITOR->physicalMonitor()->m_name : "<none>", MATCH,
            sc<int>(frame->m_session->m_type), frame->m_damage.getExtents().x, frame->m_damage.getExtents().y, frame->m_damage.getExtents().w, frame->m_damage.getExtents().h);
        if (!MATCH)
            return;

        if (!copyFBPrepared && frame->m_session->m_type != SHARE_WORKSPACE)
            return;

        if (frame->m_session->m_type == SHARE_WINDOW) {
            CBox geometry = frame->m_session->m_window->geometricBox(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
            // Use the session monitor (virtual/split aware), not the physical commit monitor.
            if (geometry.intersection({SESSIONMONITOR->m_position, SESSIONMONITOR->m_size}).empty()) {
                LOG(Log::TRACE, "[SSDBG] outputCommit skip window outside sessionMon={} geom={} {} {} {}", SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>", geometry.x,
                    geometry.y, geometry.w, geometry.h);
                return;
            }
        }

        LOG(Log::TRACE, "[SSDBG] outputCommit copy frame commitMon={} sessionMon={}", monitor ? monitor->m_name : "<none>", SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>");
        frame->copy();
    });

    std::erase_if(m_pendingFrames, [&](const WP<CScreenshareFrame>& frame) { return frame.expired() || frame->done(); });
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLMONITOR monitor) {
    if UNLIKELY (!monitor || !State::monitorState()->contains(monitor)) {
        LOG(Log::ERR, "Client requested sharing of a monitor that is gone");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(monitor, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLMONITOR monitor, CBox captureRegion) {
    if UNLIKELY (!monitor || !State::monitorState()->contains(monitor)) {
        LOG(Log::ERR, "Client requested sharing of a monitor that is gone");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(monitor, captureRegion, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLWINDOW window) {
    if UNLIKELY (!window || !window->mapped()) {
        LOG(Log::ERR, "Client requested sharing of window that is gone or not shareable!");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(window, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, SP<CWorkspaceCaptureSource> workspace) {
    if UNLIKELY (!workspace) {
        LOG(Log::ERR, "Client requested sharing of workspace that is gone or not shareable!");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(workspace, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CCursorshareSession> CScreenshareManager::newCursorSession(wl_client* client, WP<CWLPointerResource> pointer) {
    UP<CCursorshareSession> session = UP<CCursorshareSession>(new CCursorshareSession(client, pointer));

    session->m_self = session;
    m_cursorSessions.emplace_back(session);

    return session;
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, PHLMONITOR monitor) {
    return getManagedSession(SHARE_MONITOR, client, monitor, nullptr, nullptr, {});
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, PHLMONITOR monitor, CBox captureBox) {

    return getManagedSession(SHARE_REGION, client, monitor, nullptr, nullptr, captureBox);
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, PHLWINDOW window) {
    return getManagedSession(SHARE_WINDOW, client, nullptr, window, nullptr, {});
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, SP<CWorkspaceCaptureSource> workspace) {
    return getManagedSession(SHARE_WORKSPACE, client, nullptr, nullptr, workspace, {});
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(eScreenshareType type, wl_client* client, PHLMONITOR monitor, PHLWINDOW window, SP<CWorkspaceCaptureSource> ws,
                                                               CBox captureBox) {
    if (type == SHARE_NONE)
        return {};

    auto it = std::ranges::find_if(m_managedSessions, [&](const auto& session) {
        if (session->m_session->m_client != client || session->m_session->m_type != type)
            return false;

        switch (type) {
            case SHARE_MONITOR: return session->m_session->m_monitor == monitor;
            case SHARE_WINDOW: return session->m_session->m_window == window;
            case SHARE_WORKSPACE: return session->m_session->m_workspace == ws;
            case SHARE_REGION: return session->m_session->m_monitor == monitor && session->m_session->m_captureBox == captureBox;
            case SHARE_NONE:
            default: return false;
        }

        return false;
    });

    if (it == m_managedSessions.end()) {
        UP<CScreenshareSession> session;
        switch (type) {
            case SHARE_MONITOR: session = UP<CScreenshareSession>(new CScreenshareSession(monitor, client)); break;
            case SHARE_WINDOW: session = UP<CScreenshareSession>(new CScreenshareSession(window, client)); break;
            case SHARE_WORKSPACE: session = UP<CScreenshareSession>(new CScreenshareSession(ws, client)); break;
            case SHARE_REGION: session = UP<CScreenshareSession>(new CScreenshareSession(monitor, captureBox, client)); break;
            case SHARE_NONE:
            default: return {};
        }

        if (!session->isActive())
            return {};

        session->m_self = session;
        m_sessions.emplace_back(session);

        it = m_managedSessions.emplace(m_managedSessions.end(), makeUnique<SManagedSession>(std::move(session)));

        auto& managed            = *it;
        managed->stoppedListener = managed->m_session->m_events.stopped.listen([managed = WP<SManagedSession>(managed)]() {
            if (!managed)
                return;

            const auto& session = managed->m_session;
            std::erase_if(Screenshare::mgr()->m_managedSessions, [&session](const auto& s) { return s && s->m_session.get() == session.get(); });
        });
    }

    return (*it)->m_session;
}

bool CScreenshareManager::isOutputBeingSSd(PHLMONITOR monitor) {
    return std::ranges::any_of(m_sessions, [monitor](const auto& s) {
        if (!s)
            return false;
        return s->isActive() && (s->m_type == SHARE_MONITOR || s->m_type == SHARE_REGION) && isSameCommittedOutput(s->monitor(), monitor);
    });
}

void CScreenshareManager::stopSessionsForMonitor(PHLMONITOR monitor) {
    if (!monitor)
        return;

    std::erase_if(m_sessions, [](const WP<CScreenshareSession>& session) { return session.expired(); });

    for (auto& frame : m_pendingFrames) {
        if (frame.expired())
            continue;

        if (frame->m_session.expired()) {
            frame->fail();
            continue;
        }

        const auto SESSIONMONITOR = frame->m_session->monitor();
        if (isSameCommittedOutput(SESSIONMONITOR, monitor))
            frame->fail();
    }

    for (const auto& session : m_sessions) {
        if (session.expired())
            continue;

        const auto SESSIONMONITOR = session->monitor();
        if (isSameCommittedOutput(SESSIONMONITOR, monitor))
            session->stop();
    }

    std::erase_if(m_pendingFrames, [](const WP<CScreenshareFrame>& frame) { return frame.expired() || frame->done(); });
    std::erase_if(m_sessions, [](const WP<CScreenshareSession>& session) { return session.expired(); });
}

bool CScreenshareManager::isOutputDSBlocked(PHLMONITOR monitor) {
    if (std::ranges::any_of(m_pendingFrames, [monitor](const auto& frame) {
            return frame && !frame->done() && frame->m_shared && frame->m_session->m_type == SHARE_WORKSPACE && isSameCommittedOutput(frame->m_session->monitor(), monitor);
        }))
        return true;

    return std::ranges::any_of(m_sessions, [monitor](const auto& s) {
        if (!s)
            return false;
        return s->isActive() && !s->isStale() && isSameCommittedOutput(s->monitor(), monitor);
    });
}

bool CScreenshareManager::outputNeedsCopyFB(PHLMONITOR monitor) {
    return outputCopyFBState(monitor).needsCopyFB();
}

CScreenshareManager::SOutputCopyFBState CScreenshareManager::outputCopyFBState(PHLMONITOR monitor) {
    SOutputCopyFBState state;

    // user intent -> strategy: split (virtual) heads share the parent's DRM output.
    // Copy-FB and onOutputCommit are keyed off the physical monitor, so sessions
    // and pending frames on HDMI-A-1~1/~2 must count against HDMI-A-1. Exact
    // pointer match left those frames never copied (black Xiaomi screenshare).
    for (const auto& session : m_sessions) {
        if (!session || !session->isActive() || (session->m_type != SHARE_MONITOR && session->m_type != SHARE_REGION))
            continue;

        if (!isSameCommittedOutput(session->monitor(), monitor))
            continue;

        state.activeSessions++;
        if (session->m_sharing)
            state.sharingSessions++;

        if (session->m_type == SHARE_MONITOR)
            state.monitorSessions++;
        else if (session->m_type == SHARE_REGION)
            state.regionSessions++;
    }

    for (const auto& frame : m_pendingFrames) {
        if (!frame || frame->done() || !frame->m_shared)
            continue;

        if (!isSameCommittedOutput(frame->m_session->monitor(), monitor))
            continue;

        if (frame->m_session->m_type == SHARE_MONITOR) {
            state.pendingFrames++;
            state.pendingMonitorFrames++;
        } else if (frame->m_session->m_type == SHARE_REGION) {
            state.pendingFrames++;
            state.pendingRegionFrames++;
        } else if (frame->m_session->m_type == SHARE_WINDOW) {
            state.pendingFrames++;
            state.pendingWindowFrames++;
        }
    }

    return state;
}

bool CScreenshareManager::needsWorkspaceCaptureSnapshot(PHLWINDOW window) const {
    if (!window || !window->mapped() || window->isHidden() || (window->m_ruleApplicator && window->m_ruleApplicator->noScreenShare().valueOrDefault()))
        return false;

    const auto MONITOR = window->m_monitor.lock();
    if (!MONITOR)
        return false;

    const auto includesWindow = [&](const WP<CScreenshareSession>& session) {
        if (!session || !session->isActive() || session->m_type != SHARE_WORKSPACE || !session->m_workspace)
            return false;

        const auto WORKSPACE = session->m_workspace->workspace();
        if (!WORKSPACE || session->monitor() != MONITOR)
            return false;

        if (window->m_workspace != WORKSPACE &&
            !(session->m_workspace->mode() == HYPRLAND_WORKSPACE_IMAGE_CAPTURE_SOURCE_MANAGER_V1_CAPTURE_MODE_EVERYTHING &&
              (window->m_state & Desktop::View::WINDOW_STATE_PINNED) && window->isFloating()))
            return false;

        return g_pDynamicPermissionManager && g_pDynamicPermissionManager->clientPermissionMode(session->m_client, PERMISSION_TYPE_SCREENCOPY) == PERMISSION_RULE_ALLOW_MODE_ALLOW;
    };

    // Fresh sessions are not stale yet, but only actual copies set m_sharing.
    for (const auto& session : m_sessions) {
        if (session && session->m_sharing && includesWindow(session))
            return true;
    }

    return std::ranges::any_of(m_pendingFrames, [&](const auto& frame) { return frame && frame->m_shared && !frame->done() && includesWindow(frame->m_session); });
}

CScreenshareManager::SManagedSession::SManagedSession(UP<CScreenshareSession>&& session) : m_session(std::move(session)) {
    ;
}
