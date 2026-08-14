#include "MonitorStateTracker.hpp"
#include "MonitorQuery.hpp"

#include <algorithm>

using namespace State;

CMonitorQuery IMonitorStateTracker::query() const {
    return CMonitorQuery{*this};
}

bool IMonitorStateTracker::contains(PHLMONITOR monitor) const {
    // Logical/virtual (split) monitors live in monitors(), not allMonitors()
    // (which is only the real physical outputs). Screenshare and other
    // lifetime checks must accept both.
    return std::ranges::contains(monitors(), monitor) || std::ranges::contains(allMonitors(), monitor);
}
