#include "MonitorState.hpp"
#include "FallbackState.hpp"

#include "../event/EventBus.hpp"
#include "../output/Monitor.hpp"
#include "../render/Renderer.hpp"
#include "../config/shared/monitor/MonitorRuleManager.hpp"
#include "../protocols/ColorManagement.hpp"
#include "../output/MonitorFrameScheduler.hpp"
#include "../Compositor.hpp"
#include "../managers/input/InputManager.hpp"
#include "../managers/ProtocolManager.hpp"
#include "../layout/LayoutManager.hpp"
#include "../layout/space/Space.hpp"
#include "../pointer/PointerManager.hpp"
#include "../pointer/PointerController.hpp"
#include "../desktop/state/WindowState.hpp"
#include "../desktop/state/FocusState.hpp"
#include "../desktop/Workspace.hpp"
#include "../desktop/view/Window.hpp"
#include "../config/shared/monitor/MonitorRule.hpp"
#include "../managers/fullscreen/FullscreenController.hpp"
#include "../protocols/XDGOutput.hpp"
#include "WorkspaceState.hpp"

#include <climits>
#include <cmath>
#include <format>
#include <unordered_map>
#include <unordered_set>

using namespace State;

UP<CMonitorStateTracker>& State::monitorState() {
    static UP<CMonitorStateTracker> p = makeUnique<CMonitorStateTracker>();
    return p;
}

CMonitorStateTracker::CMonitorStateTracker() {
    m_listeners.monitorAdded   = Event::bus()->m_events.monitor.added.listen([this](PHLMONITOR m) {
        if (!std::ranges::contains(m_monitors, m))
            m_monitors.emplace_back(m);
    });
    m_listeners.monitorRemoved = Event::bus()->m_events.monitor.removed.listen([this](PHLMONITOR m) { std::erase(m_monitors, m); });

    // Split-monitor: the logical (m_monitors) list is a virtual-expanded view of the
    // real outputs. Rebuild it whenever the layout changes.
    m_listeners.layoutChanged = Event::bus()->m_events.monitor.layoutChanged.listen([this]() { rebuildVirtualMonitors(); });
}

const std::vector<PHLMONITOR>& CMonitorStateTracker::allMonitors() const {
    return m_realMonitors;
}

const std::vector<PHLMONITOR>& CMonitorStateTracker::monitors() const {
    return m_monitors;
}

MONITORID CMonitorStateTracker::getNextAvailableMonitorID(const std::string& name) {
    // reuse ID if it's already in the map, and the monitor with that ID is not being used by another monitor
    if (m_monitorIDMap.contains(name) && !std::ranges::any_of(m_realMonitors, [&](auto m) { return m->m_id == m_monitorIDMap[name]; }))
        return m_monitorIDMap[name];

    // otherwise, find minimum available ID that is not in the map
    std::unordered_set<MONITORID> usedIDs;
    for (auto const& monitor : m_realMonitors) {
        usedIDs.insert(monitor->m_id);
    }

    MONITORID nextID = 0;
    while (usedIDs.contains(nextID)) {
        nextID++;
    }
    m_monitorIDMap[name] = nextID;
    return nextID;
}

static void checkDefaultCursorWarp(PHLMONITOR monitor) {
    static auto PCURSORMONITOR    = CConfigValue<std::string>("cursor:default_monitor");
    static bool cursorDefaultDone = false;
    static bool firstLaunch       = true;

    const auto  POS = monitor->middle();

    // by default, cursor should be set to first monitor detected
    // this is needed as a default if the monitor given in config above doesn't exist
    if (firstLaunch) {
        firstLaunch = false;
        Pointer::pointerController()->warpTo(POS, true);
        g_pInputManager->refocus();
        return;
    }

    if (!cursorDefaultDone && *PCURSORMONITOR != STRVAL_EMPTY) {
        const auto MONITOR = State::monitorState()->query().configString(*PCURSORMONITOR).run();
        if (MONITOR && MONITOR->m_id == monitor->m_id) {
            cursorDefaultDone = true;
            Pointer::pointerController()->warpTo(POS, true);
            g_pInputManager->refocus();
            return;
        }
    }

    // modechange happened check if cursor is on that monitor and warp it to middle to not place it out of bounds if resolution changed.
    if (State::monitorState()->query().vec(Pointer::mgr()->untransformedPosition()).run() == monitor) {
        Pointer::pointerController()->warpTo(POS, true);
        g_pInputManager->refocus();
    }
}

void CMonitorStateTracker::add(PHLMONITOR mon) {

    mon->m_id   = getNextAvailableMonitorID(mon->m_name);
    mon->m_self = mon;

    m_realMonitors.emplace_back(mon);

    LOG(Log::DEBUG, "[CMonitorStateTracker] New monitor: {}", mon->m_name);

    Event::bus()->m_events.monitor.newMon.emit(mon);

    mon->onConnect(false);

    if (!mon->m_enabled)
        return;

    // ready to process if we have a real monitor

    if ((!g_pHyprRenderer->m_mostHzMonitor || mon->m_refreshRate > g_pHyprRenderer->m_mostHzMonitor->m_refreshRate) && mon->m_enabled)
        g_pHyprRenderer->m_mostHzMonitor = mon;

    Config::monitorRuleMgr()->scheduleReload();

    mon->scheduleFrame(Aquamarine::IOutput::AQ_SCHEDULE_NEW_MONITOR);

    checkDefaultCursorWarp(mon);

    mon->updateSurfaceScaleTransformDetails();

    g_pHyprRenderer->damageMonitor(mon);
    mon->m_frameScheduler->onFrame();

    if (PROTO::colorManagement && g_pCompositor->shouldChangePreferredImageDescription()) {
        LOG(Log::ERR, "FIXME: color management protocol is enabled, need a preferred image description id");
        PROTO::colorManagement->onImagePreferredChanged(0);
    }
}

void CMonitorStateTracker::add(SP<Aquamarine::IOutput> output) {
    add(makeShared<Monitor::CMonitor>(output));
}

void CMonitorStateTracker::remove(PHLMONITOR mon) {
    std::erase(m_realMonitors, mon);
    std::erase(m_monitors, mon);

    Event::bus()->m_events.monitor.destroyMon.emit(mon);
}

void CMonitorStateTracker::finish() {
    m_realMonitors.clear();
    m_monitors.clear();
    m_virtualMonitors.clear();
}

std::vector<PHLMONITOR> CMonitorStateTracker::getLogicalMonitorsFor(PHLMONITOR pMonitor) {
    std::vector<PHLMONITOR> result;
    if (!pMonitor)
        return result;

    const auto PHYSICAL = pMonitor->physicalMonitor();
    if (!PHYSICAL)
        return result;

    for (auto const& m : m_monitors) {
        if (!m || !m->m_enabled)
            continue;

        if (m->physicalMonitor() == PHYSICAL)
            result.emplace_back(m);
    }

    return result;
}

PHLMONITOR CMonitorStateTracker::getPrimaryLogicalMonitor(PHLMONITOR pMonitor) {
    const auto LOGICAL = getLogicalMonitorsFor(pMonitor);
    if (!LOGICAL.empty())
        return LOGICAL.front();

    return pMonitor;
}

static WORKSPACEID nextFreeWorkspaceID() {
    for (WORKSPACEID i = 1; i < LONG_MAX; ++i) {
        if (!State::workspaceState()->query().id(i).run())
            return i;
    }

    return LONG_MAX;
}

void CMonitorStateTracker::rebuildVirtualMonitors() {
    if (g_pCompositor->m_isShuttingDown || m_rebuilding)
        return;

    m_rebuilding = true;

    std::unordered_map<std::string, PHLWORKSPACE> previousActiveWorkspaces;
    std::unordered_map<std::string, PHLMONITOR>   previousVirtualMonitors;
    std::string                                   previousFocusedMonitor;

    if (const auto FOCUSED = Desktop::focusState()->monitor())
        previousFocusedMonitor = FOCUSED->m_name;

    for (auto const& m : m_monitors) {
        if (m && m->m_activeWorkspace)
            previousActiveWorkspaces[m->m_name] = m->m_activeWorkspace;

        if (m && m->isVirtual())
            previousVirtualMonitors[m->m_name] = m;
    }

    for (auto const& m : m_realMonitors) {
        if (m)
            m->m_virtualMonitors.clear();
    }

    m_virtualMonitors.clear();
    m_monitors.clear();

    auto attachWorkspace = [&](PHLMONITOR monitor, PHLWORKSPACE workspace) {
        if (!monitor || !workspace)
            return;

        const auto OLD_MONITOR = workspace->m_monitor.lock();
        workspace->m_monitor   = monitor;
        workspace->m_visible   = true;
        workspace->m_lastMonitor.clear();
        workspace->m_space->recheckWorkArea();
        workspace->m_events.monitorChanged.emit();

        monitor->m_activeWorkspace = workspace;

        for (auto const& w : Desktop::windowState()->windows()) {
            if (w->m_workspace != workspace || w->m_pinned)
                continue;

            w->m_monitor = monitor;

            if (OLD_MONITOR && OLD_MONITOR != monitor && w->m_isFloating)
                w->layoutTarget()->setPositionGlobal(w->layoutTarget()->position().translate(-OLD_MONITOR->m_position + monitor->m_position));

            if (Fullscreen::controller()->isFullscreen(w))
                w->setBox(CBox{monitor->m_position, monitor->m_size});

            w->updateToplevel();
        }
    };

    auto createWorkspaceFor = [&](PHLMONITOR monitor) -> PHLWORKSPACE {
        const auto ID = nextFreeWorkspaceID();
        return State::workspaceState()->create(ID, monitor->m_id, std::to_string(ID));
    };

    struct SResolvedSplit {
        std::string suffix;
        Vector2D    offset;
        Vector2D    size;
    };

    auto resolveTracks = [](const std::vector<Config::CMonitorRule::SSplitTrack>& tracks_, double total) -> std::vector<double> {
        const std::vector<Config::CMonitorRule::SSplitTrack> defaultTracks = {Config::CMonitorRule::SSplitTrack{}};
        const auto&                                          tracks        = tracks_.empty() ? defaultTracks : tracks_;

        double                                               fixed  = 0;
        double                                               weight = 0;
        for (const auto& track : tracks) {
            if (track.type == Config::CMonitorRule::SSplitTrack::TRACK_PIXELS)
                fixed += track.value;
            else if (track.type == Config::CMonitorRule::SSplitTrack::TRACK_PERCENT)
                fixed += total * track.value;
            else
                weight += track.value;
        }

        const double        FIXED_SCALE = fixed > total && fixed > 0 ? total / fixed : 1.0;
        const double        REMAINING   = std::max(0.0, total - fixed * FIXED_SCALE);

        std::vector<double> edges;
        edges.reserve(tracks.size() + 1);
        edges.emplace_back(0);

        double cursor = 0;
        for (size_t i = 0; i < tracks.size(); ++i) {
            const auto& track = tracks[i];
            double      size  = 0;

            if (track.type == Config::CMonitorRule::SSplitTrack::TRACK_PIXELS)
                size = track.value * FIXED_SCALE;
            else if (track.type == Config::CMonitorRule::SSplitTrack::TRACK_PERCENT)
                size = total * track.value * FIXED_SCALE;
            else if (weight > 0)
                size = REMAINING * track.value / weight;

            cursor += size;
            edges.emplace_back(i + 1 == tracks.size() ? total : std::clamp(cursor, 0.0, total));
        }

        edges.back() = total;
        return edges;
    };

    auto resolveSplitsFor = [&](PHLMONITOR realMonitor) -> std::vector<SResolvedSplit> {
        std::vector<SResolvedSplit> result;

        if (!realMonitor->m_activeMonitorRule.m_splitAreas.empty()) {
            for (const auto& area : realMonitor->m_activeMonitorRule.m_splitAreas) {
                const double X1 = std::clamp(area.offset.x, 0.0, realMonitor->m_size.x);
                const double Y1 = std::clamp(area.offset.y, 0.0, realMonitor->m_size.y);
                const double X2 = std::clamp(area.offset.x + area.size.x, 0.0, realMonitor->m_size.x);
                const double Y2 = std::clamp(area.offset.y + area.size.y, 0.0, realMonitor->m_size.y);

                if (X2 <= X1 || Y2 <= Y1)
                    continue;

                result.emplace_back(SResolvedSplit{.suffix = area.name, .offset = Vector2D{X1, Y1}.round(), .size = Vector2D{X2 - X1, Y2 - Y1}.round()});
            }

            return result;
        }

        if (!realMonitor->m_activeMonitorRule.m_splitColumns.empty() || !realMonitor->m_activeMonitorRule.m_splitRows.empty()) {
            const auto XEDGES = resolveTracks(realMonitor->m_activeMonitorRule.m_splitColumns, realMonitor->m_size.x);
            const auto YEDGES = resolveTracks(realMonitor->m_activeMonitorRule.m_splitRows, realMonitor->m_size.y);

            for (size_t row = 0; row + 1 < YEDGES.size(); ++row) {
                for (size_t column = 0; column + 1 < XEDGES.size(); ++column) {
                    const auto X1 = std::round(XEDGES[column]);
                    const auto X2 = std::round(XEDGES[column + 1]);
                    const auto Y1 = std::round(YEDGES[row]);
                    const auto Y2 = std::round(YEDGES[row + 1]);

                    if (X2 <= X1 || Y2 <= Y1)
                        continue;

                    result.emplace_back(SResolvedSplit{.offset = Vector2D{X1, Y1}, .size = Vector2D{X2 - X1, Y2 - Y1}});
                }
            }

            return result;
        }

        const auto SPLIT_COLUMNS = std::max(1, sc<int>(realMonitor->m_activeMonitorRule.m_split.x));
        const auto SPLIT_ROWS    = std::max(1, sc<int>(realMonitor->m_activeMonitorRule.m_split.y));

        for (int row = 0; row < SPLIT_ROWS; ++row) {
            for (int column = 0; column < SPLIT_COLUMNS; ++column) {
                const auto X1 = std::round(realMonitor->m_size.x * column / SPLIT_COLUMNS);
                const auto X2 = std::round(realMonitor->m_size.x * (column + 1) / SPLIT_COLUMNS);
                const auto Y1 = std::round(realMonitor->m_size.y * row / SPLIT_ROWS);
                const auto Y2 = std::round(realMonitor->m_size.y * (row + 1) / SPLIT_ROWS);

                if (X2 <= X1 || Y2 <= Y1)
                    continue;

                result.emplace_back(SResolvedSplit{.offset = Vector2D{X1, Y1}, .size = Vector2D{X2 - X1, Y2 - Y1}.round()});
            }
        }

        return result;
    };

    for (auto const& realMonitor : m_realMonitors) {
        if (!realMonitor || !realMonitor->m_output || !realMonitor->m_enabled || realMonitor->isMirror() || realMonitor->m_isUnsafeFallback)
            continue;

        const auto HAS_CUSTOM_SPLIT = !realMonitor->m_activeMonitorRule.m_splitColumns.empty() || !realMonitor->m_activeMonitorRule.m_splitRows.empty() ||
            !realMonitor->m_activeMonitorRule.m_splitAreas.empty();
        const auto SPLIT_AREAS = resolveSplitsFor(realMonitor);

        if (SPLIT_AREAS.empty() || (!HAS_CUSTOM_SPLIT && SPLIT_AREAS.size() <= 1)) {
            m_monitors.emplace_back(realMonitor);
            if (!realMonitor->m_activeWorkspace)
                realMonitor->m_activeWorkspace = createWorkspaceFor(realMonitor);
            attachWorkspace(realMonitor, realMonitor->m_activeWorkspace);
            continue;
        }

        const auto BASE_ID = std::max<MONITORID>(0, realMonitor->m_id) * 64 + 10000;

        for (size_t i = 0; i < SPLIT_AREAS.size(); ++i) {
            const auto& AREA  = SPLIT_AREAS[i];
            const int   INDEX = sc<int>(i);
            const auto  NAME  = AREA.suffix.empty() ? std::format("{}~{}", realMonitor->m_name, INDEX + 1) : std::format("{}~{}", realMonitor->m_name, AREA.suffix);

            PHLMONITOR  monitor;
            if (const auto IT = previousVirtualMonitors.find(NAME); IT != previousVirtualMonitors.end() && IT->second && IT->second->physicalMonitor() == realMonitor) {
                monitor = IT->second;

                for (auto& layer : monitor->m_layerSurfaceLayers)
                    std::erase_if(layer, [](const auto& ls) { return ls.expired(); });
            } else {
                monitor         = makeShared<Monitor::CMonitor>(realMonitor->m_output);
                monitor->m_self = monitor;
            }

            monitor->m_isVirtual         = true;
            monitor->m_parentMonitor     = realMonitor;
            monitor->m_virtualIndex      = INDEX;
            monitor->m_enabled           = true;
            monitor->m_dpmsStatus        = realMonitor->m_dpmsStatus;
            monitor->m_name              = NAME;
            monitor->m_description       = realMonitor->m_description;
            monitor->m_shortDescription  = realMonitor->m_shortDescription;
            monitor->m_id                = BASE_ID + INDEX;
            monitor->m_scale             = realMonitor->m_scale;
            monitor->m_setScale          = realMonitor->m_setScale;
            monitor->m_transform         = realMonitor->m_transform;
            monitor->m_refreshRate       = realMonitor->m_refreshRate;
            monitor->m_activeMonitorRule = realMonitor->m_activeMonitorRule;
            monitor->m_reservedArea      = realMonitor->m_reservedArea;
            monitor->m_cmType            = realMonitor->m_cmType;
            monitor->m_sdrEotf           = realMonitor->m_sdrEotf;
            monitor->m_sdrSaturation     = realMonitor->m_sdrSaturation;
            monitor->m_sdrBrightness     = realMonitor->m_sdrBrightness;
            monitor->m_imageDescription  = realMonitor->m_imageDescription;

            monitor->m_position        = realMonitor->m_position + AREA.offset;
            monitor->m_size            = AREA.size;
            monitor->m_pixelSize       = (monitor->m_size * monitor->m_scale).round();
            monitor->m_transformedSize = monitor->m_pixelSize;
            monitor->m_damage.setSize(monitor->m_transformedSize);

            realMonitor->m_virtualMonitors.emplace_back(monitor);
            m_virtualMonitors.emplace_back(monitor);
            m_monitors.emplace_back(monitor);
        }
    }

    for (auto const& realMonitor : m_realMonitors) {
        if (!realMonitor || realMonitor->m_virtualMonitors.empty())
            continue;

        for (auto const& logicalRef : realMonitor->m_virtualMonitors) {
            const auto LOGICAL = logicalRef.lock();
            if (!LOGICAL)
                continue;

            PHLWORKSPACE workspace = nullptr;

            if (previousActiveWorkspaces.contains(LOGICAL->m_name))
                workspace = previousActiveWorkspaces[LOGICAL->m_name];
            else if (LOGICAL->m_virtualIndex == 0 && previousActiveWorkspaces.contains(realMonitor->m_name))
                workspace = previousActiveWorkspaces[realMonitor->m_name];
            else if (LOGICAL->m_virtualIndex == 0 && realMonitor->m_activeWorkspace)
                workspace = realMonitor->m_activeWorkspace;

            if (!workspace)
                workspace = createWorkspaceFor(LOGICAL);

            attachWorkspace(LOGICAL, workspace);
        }

        realMonitor->m_activeWorkspace = realMonitor->m_virtualMonitors.front().lock()->m_activeWorkspace;
    }

    const auto FALLBACK_MONITOR = m_monitors.empty() ? PHLMONITOR{} : m_monitors.front();
    for (auto const& workspace : State::workspaceState()->workspacesCopy()) {
        if (!workspace || workspace->m_isSpecialWorkspace || !FALLBACK_MONITOR)
            continue;

        const auto MONITOR = workspace->m_monitor.lock();
        if (MONITOR && std::ranges::find(m_monitors, MONITOR) != m_monitors.end())
            continue;

        workspace->m_monitor = FALLBACK_MONITOR;
        workspace->m_visible = false;
        workspace->m_space->recheckWorkArea();
        workspace->m_events.monitorChanged.emit();

        for (auto const& w : Desktop::windowState()->windows()) {
            if (w->m_workspace == workspace && !w->m_pinned)
                w->m_monitor = FALLBACK_MONITOR;
        }
    }

    if (!previousFocusedMonitor.empty()) {
        if (const auto FOCUSED = State::monitorState()->query().name(previousFocusedMonitor).run())
            Desktop::focusState()->rawMonitorFocus(FOCUSED);
    }

    if ((!Desktop::focusState()->monitor() || std::ranges::find(m_monitors, Desktop::focusState()->monitor()) == m_monitors.end()) && !m_monitors.empty())
        Desktop::focusState()->rawMonitorFocus(m_monitors.front());

    for (auto const& m : m_monitors) {
        g_pHyprRenderer->arrangeLayersForMonitor(m->m_id);
        g_layoutManager->recalculateMonitor(m);
    }

    // wl_output/xdg-output are resynced from logical m_monitors here.
    if (g_pProtocolManager)
        g_pProtocolManager->syncOutputsWithMonitorLayout();

    if (PROTO::xdgOutput)
        PROTO::xdgOutput->updateAllOutputs();

    m_rebuilding = false;
}
