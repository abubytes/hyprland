#include "ScreenshareManager.hpp"
#include "../../render/Renderer.hpp"
#include "../../Compositor.hpp"
#include "../../desktop/view/Window.hpp"
#include "../../protocols/core/Seat.hpp"
#include "../../event/EventBus.hpp"

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

void CScreenshareManager::onOutputCommit(PHLMONITOR monitor) {
    std::erase_if(m_sessions, [&](const WP<CScreenshareSession>& session) { return session.expired(); });

    if (!m_pendingFrames.empty())
        LOGM(Log::WARN, "[SSDBG] outputCommit mon={} id={} virt={} physical={} pending={} sessions={}", monitor ? monitor->m_name : "<none>", monitor ? monitor->m_id : -1,
             monitor ? monitor->isVirtual() : false, monitor && monitor->physicalMonitor() ? monitor->physicalMonitor()->m_name : "<none>", m_pendingFrames.size(), m_sessions.size());

    // if no pending frames, and no sessions are sharing, then unblock ds
    if (m_pendingFrames.empty()) {
        for (const auto& session : m_sessions) {
            if (!session->m_stopped && session->m_sharing)
                return;
        }

        g_pHyprRenderer->m_directScanoutBlocked = false;
        return; // nothing to share
    }

    std::ranges::for_each(m_pendingFrames, [&](WP<CScreenshareFrame>& frame) {
        if (frame.expired()) {
            LOGM(Log::WARN, "[SSDBG] outputCommit skip expired frame commitMon={}", monitor ? monitor->m_name : "<none>");
            return;
        }

        const bool FRAME_DONE = frame->done();
        if (!frame->m_shared || FRAME_DONE) {
            LOGM(Log::WARN, "[SSDBG] outputCommit skip frame commitMon={} shared={} done={} copied={} failed={}", monitor ? monitor->m_name : "<none>", frame->m_shared, FRAME_DONE,
                 frame->m_copied, frame->m_failed);
            return;
        }

        const auto SESSIONMONITOR = frame->m_session->monitor();
        const bool MATCH          = isSameCommittedOutput(SESSIONMONITOR, monitor);
        LOGM(Log::WARN, "[SSDBG] outputCommit consider commitMon={} sessionMon={} sessionPhys={} match={} type={} damage={} {} {} {}", monitor ? monitor->m_name : "<none>",
             SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>", SESSIONMONITOR && SESSIONMONITOR->physicalMonitor() ? SESSIONMONITOR->physicalMonitor()->m_name : "<none>", MATCH,
             sc<int>(frame->m_session->m_type), frame->m_damage.getExtents().x, frame->m_damage.getExtents().y, frame->m_damage.getExtents().w, frame->m_damage.getExtents().h);
        if (!MATCH)
            return;

        if (frame->m_session->m_type == SHARE_WINDOW) {
            CBox geometry = {frame->m_session->m_window->m_realPosition->value(), frame->m_session->m_window->m_realSize->value()};
            if (geometry.intersection({SESSIONMONITOR->m_position, SESSIONMONITOR->m_size}).empty()) {
                LOGM(Log::WARN, "[SSDBG] outputCommit skip window outside sessionMon={} geom={} {} {} {}", SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>", geometry.x, geometry.y,
                     geometry.w, geometry.h);
                return;
            }
        }

        LOGM(Log::WARN, "[SSDBG] outputCommit copy frame commitMon={} sessionMon={}", monitor ? monitor->m_name : "<none>", SESSIONMONITOR ? SESSIONMONITOR->m_name : "<none>");
        frame->copy();
    });

    std::erase_if(m_pendingFrames, [&](const WP<CScreenshareFrame>& frame) { return frame.expired(); });
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLMONITOR monitor) {
    if UNLIKELY (!monitor || !g_pCompositor->monitorExists(monitor)) {
        LOGM(Log::ERR, "Client requested sharing of a monitor that is gone");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(monitor, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLMONITOR monitor, CBox captureRegion) {
    if UNLIKELY (!monitor || !g_pCompositor->monitorExists(monitor)) {
        LOGM(Log::ERR, "Client requested sharing of a monitor that is gone");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(monitor, captureRegion, client));

    session->m_self = session;
    m_sessions.emplace_back(session);

    return session;
}

UP<CScreenshareSession> CScreenshareManager::newSession(wl_client* client, PHLWINDOW window) {
    if UNLIKELY (!window || !window->m_isMapped) {
        LOGM(Log::ERR, "Client requested sharing of window that is gone or not shareable!");
        return nullptr;
    }

    UP<CScreenshareSession> session = UP<CScreenshareSession>(new CScreenshareSession(window, client));

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
    return getManagedSession(SHARE_MONITOR, client, monitor, nullptr, {});
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, PHLMONITOR monitor, CBox captureBox) {

    return getManagedSession(SHARE_REGION, client, monitor, nullptr, captureBox);
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(wl_client* client, PHLWINDOW window) {
    return getManagedSession(SHARE_WINDOW, client, nullptr, window, {});
}

WP<CScreenshareSession> CScreenshareManager::getManagedSession(eScreenshareType type, wl_client* client, PHLMONITOR monitor, PHLWINDOW window, CBox captureBox) {
    if (type == SHARE_NONE)
        return {};

    auto it = std::ranges::find_if(m_managedSessions, [&](const auto& session) {
        if (session->m_session->m_client != client || session->m_session->m_type != type)
            return false;

        switch (type) {
            case SHARE_MONITOR: return session->m_session->m_monitor == monitor;
            case SHARE_WINDOW: return session->m_session->m_window == window;
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
            case SHARE_REGION: session = UP<CScreenshareSession>(new CScreenshareSession(monitor, captureBox, client)); break;
            case SHARE_NONE:
            default: return {};
        }

        session->m_self = session;
        m_sessions.emplace_back(session);

        it = m_managedSessions.emplace(m_managedSessions.end(), makeUnique<SManagedSession>(std::move(session)));

        auto& managed            = *it;
        managed->stoppedListener = managed->m_session->m_events.stopped.listen([managed = WP<SManagedSession>(managed)]() {
            if (!managed)
                return;

            const auto& session = managed->m_session;
            std::erase_if(Screenshare::mgr()->m_managedSessions, [&session](const auto& s) { return s && s->m_session == session; });
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

    if (m_pendingFrames.empty()) {
        for (const auto& session : m_sessions) {
            if (!session.expired() && !session->m_stopped && session->m_sharing)
                return;
        }

        g_pHyprRenderer->m_directScanoutBlocked = false;
    }
}

CScreenshareManager::SManagedSession::SManagedSession(UP<CScreenshareSession>&& session) : m_session(std::move(session)) {
    ;
}
