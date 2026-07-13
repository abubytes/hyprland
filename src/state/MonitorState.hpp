#pragma once

#include <vector>
#include <unordered_map>
#include <aquamarine/output/Output.hpp>

#include "MonitorStateTracker.hpp"

#include "../desktop/DesktopTypes.hpp"
#include "../helpers/signal/Signal.hpp"
#include "../SharedDefs.hpp"

namespace State {
    class CMonitorStateTracker : public IMonitorStateTracker {
      public:
        CMonitorStateTracker();
        virtual ~CMonitorStateTracker() override = default;

        virtual const std::vector<PHLMONITOR>& allMonitors() const override;
        virtual const std::vector<PHLMONITOR>& monitors() const override;

        // Split-monitor: logical monitors backed by a physical output.
        std::vector<PHLMONITOR>                getLogicalMonitorsFor(PHLMONITOR pMonitor);
        PHLMONITOR                             getPrimaryLogicalMonitor(PHLMONITOR pMonitor);

        void                                   add(PHLMONITOR mon);
        void                                   add(SP<Aquamarine::IOutput> output);
        void                                   remove(PHLMONITOR mon);

        void                                   finish();

      private:
        MONITORID                                  getNextAvailableMonitorID(const std::string& name);

        // Split-monitor: rebuilds the logical (virtual) monitor list from the real outputs.
        // Invoked from the monitor.layoutChanged listener; m_rebuilding guards re-entrancy.
        void                                       rebuildVirtualMonitors();

        std::vector<PHLMONITOR>                    m_realMonitors;
        std::vector<PHLMONITOR>                    m_monitors;
        std::vector<PHLMONITOR>                    m_virtualMonitors;
        bool                                       m_rebuilding = false;

        std::unordered_map<std::string, MONITORID> m_monitorIDMap;

        struct {
            CHyprSignalListener monitorAdded;
            CHyprSignalListener monitorRemoved;
            CHyprSignalListener layoutChanged;
        } m_listeners;
    };

    UP<CMonitorStateTracker>& monitorState();
}