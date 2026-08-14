#include "PresentationTime.hpp"
#include <algorithm>
#include "../output/Monitor.hpp"
#include "../event/EventBus.hpp"
#include "core/Compositor.hpp"
#include "core/Output.hpp"
#include <aquamarine/output/Output.hpp>

static bool isSamePresentedOutput(PHLMONITOR queuedMonitor, PHLMONITOR presentedMonitor) {
    if (!queuedMonitor || !presentedMonitor)
        return false;

    if (queuedMonitor == presentedMonitor)
        return true;

    const auto QUEUEDPHYSICAL    = queuedMonitor->physicalMonitor();
    const auto PRESENTEDPHYSICAL = presentedMonitor->physicalMonitor();

    return QUEUEDPHYSICAL && PRESENTEDPHYSICAL && QUEUEDPHYSICAL == PRESENTEDPHYSICAL;
}

CQueuedPresentationData::CQueuedPresentationData(SP<CWLSurfaceResource> surf, std::vector<WP<CPresentationFeedback>> feedbacks) :
    m_surface(surf), m_feedbacks(std::move(feedbacks)) {
    ;
}

void CQueuedPresentationData::setPresentationType(bool zeroCopy_) {
    m_zeroCopy = zeroCopy_;
}

void CQueuedPresentationData::attachMonitor(PHLMONITOR pMonitor_) {
    m_monitor = pMonitor_;
}

void CQueuedPresentationData::presented() {
    m_wasPresented = true;
}

void CQueuedPresentationData::discarded() {
    m_wasPresented = false;
}

CPresentationFeedback::CPresentationFeedback(UP<CWpPresentationFeedback>&& resource_, SP<CWLSurfaceResource> surf) : m_resource(std::move(resource_)), m_surface(surf) {
    if UNLIKELY (!good())
        return;

    m_resource->setOnDestroy([this](CWpPresentationFeedback* pMgr) {
        if (!m_done) // if it's done, it's probably already destroyed. If not, it will be in a sec.
            PROTO::presentation->destroyResource(this);
    });
}

bool CPresentationFeedback::good() {
    return m_resource->resource();
}

void CPresentationFeedback::sendQueued(WP<CQueuedPresentationData> data, const timespec& when, uint32_t untilRefreshNs, uint64_t seq, uint32_t reportedFlags) {
    // `data` is a WP over a CUniquePointer (m_queue entries). That kind of weak
    // pointer is NOT lockable — hyprutils asserts/terminates on data.lock().
    // Use operator-> / valid() only. m_monitor is PHLMONITORREF (WP over SP) and may lock.
    if (!data || !good()) {
        m_done = true;
        return;
    }

    auto client = m_resource->client();

    const auto MONITOR   = data->m_monitor.lock();
    const bool PRESENTED = data->m_wasPresented && MONITOR && MONITOR->m_output;

    // Presentation queue entries can outlive the monitor they were attached to
    // during DPMS, hotplug, or screencopy teardown. Without a monitor we cannot
    // report valid presentation metadata, so discard the feedback instead.
    if LIKELY (PRESENTED && PROTO::outputs.contains(MONITOR->m_name)) {
        if LIKELY (auto outputResources = PROTO::outputs.at(MONITOR->m_name)->outputResourcesFrom(client); !outputResources.empty()) {
            for (const auto& r : outputResources) {
                m_resource->sendSyncOutput(r->getResource()->resource());
            }
        }
    }

    if (PRESENTED) {
        uint32_t flags = 0;
        if (!MONITOR->m_tearingState.activelyTearing)
            flags |= WP_PRESENTATION_FEEDBACK_KIND_VSYNC;
        if (data->m_zeroCopy)
            flags |= WP_PRESENTATION_FEEDBACK_KIND_ZERO_COPY;
        if (reportedFlags & Aquamarine::IOutput::AQ_OUTPUT_PRESENT_HW_CLOCK)
            flags |= WP_PRESENTATION_FEEDBACK_KIND_HW_CLOCK;
        if (reportedFlags & Aquamarine::IOutput::AQ_OUTPUT_PRESENT_HW_COMPLETION)
            flags |= WP_PRESENTATION_FEEDBACK_KIND_HW_COMPLETION;

        time_t tv_sec = 0;
        if (sizeof(time_t) > 4)
            tv_sec = when.tv_sec >> 32;

        uint32_t refreshNs = m_resource->version() == 1 && MONITOR->m_vrrActive && MONITOR->m_output->vrrCapable ? 0 : untilRefreshNs;

        m_resource->sendPresented(sc<uint32_t>(tv_sec), sc<uint32_t>(when.tv_sec & 0xFFFFFFFF), sc<uint32_t>(when.tv_nsec), refreshNs, sc<uint32_t>(seq >> 32),
                                  sc<uint32_t>(seq & 0xFFFFFFFF), sc<wpPresentationFeedbackKind>(flags));
    } else
        m_resource->sendDiscarded();

    m_done = true;
}

void CPresentationFeedback::sendDiscarded() {
    if (m_done)
        return;

    m_resource->sendDiscarded();
    m_done = true;
}

CPresentationProtocol::CPresentationProtocol(const wl_interface* iface, const int& ver, const std::string& name) : IWaylandProtocol(iface, ver, name) {
    static auto P = Event::bus()->m_events.monitor.removed.listen([this](PHLMONITOR mon) {
        for (auto& data : m_queue) {
            // Match virtual/split monitors to their physical present target.
            if (!data->m_surface || isSamePresentedOutput(data->m_monitor.lock(), mon))
                discardFeedbacks(data->m_feedbacks);
        }

        std::erase_if(m_queue, [mon](const auto& other) { return !other->m_surface || isSamePresentedOutput(other->m_monitor.lock(), mon); });
    });
}

void CPresentationProtocol::bindManager(wl_client* client, void* data, uint32_t ver, uint32_t id) {
    const auto RESOURCE = m_managers.emplace_back(makeUnique<CWpPresentation>(client, ver, id)).get();
    RESOURCE->setOnDestroy([this](CWpPresentation* p) { this->onManagerResourceDestroy(p->resource()); });

    RESOURCE->setDestroy([this](CWpPresentation* pMgr) { this->onManagerResourceDestroy(pMgr->resource()); });
    RESOURCE->setFeedback([this](CWpPresentation* pMgr, wl_resource* surf, uint32_t id) { this->onGetFeedback(pMgr, surf, id); });
    RESOURCE->sendClockId(CLOCK_MONOTONIC);
}

void CPresentationProtocol::onManagerResourceDestroy(wl_resource* res) {
    std::erase_if(m_managers, [&](const auto& other) { return other->resource() == res; });
}

void CPresentationProtocol::destroyResource(CPresentationFeedback* feedback) {
    feedback->m_done = true;
    std::erase_if(m_feedbacks, [&](const auto& other) { return other.get() == feedback; });
}

void CPresentationProtocol::onGetFeedback(CWpPresentation* pMgr, wl_resource* surf, uint32_t id) {
    const auto  CLIENT = pMgr->client();
    const auto& RESOURCE =
        m_feedbacks.emplace_back(makeUnique<CPresentationFeedback>(makeUnique<CWpPresentationFeedback>(CLIENT, pMgr->version(), id), CWLSurfaceResource::fromResource(surf)));

    if UNLIKELY (!RESOURCE->good()) {
        pMgr->noMemory();
        m_feedbacks.pop_back();
        return;
    }

    if (const auto SURFACE = CWLSurfaceResource::fromResource(surf); SURFACE) {
        SURFACE->m_pending.presentationFeedbacks.emplace_back(RESOURCE);
        SURFACE->m_pending.updated.bits.presentation = true;
    }
}

void CPresentationProtocol::onPresented(PHLMONITOR pMonitor, const timespec& when, uint32_t untilRefreshNs, uint64_t seq, uint32_t reportedFlags) {
    // Upstream associates feedbacks with committed surface state (on the queue entry).
    // Keep isSamePresentedOutput so virtual/split monitors match their physical present.
    for (auto const& data : m_queue) {
        if (!data->m_surface || !data->m_monitor) {
            discardFeedbacks(data->m_feedbacks);
            continue;
        }

        if (!isSamePresentedOutput(data->m_monitor.lock(), pMonitor))
            continue;

        for (auto const& feedback : data->m_feedbacks) {
            if (!feedback || feedback->m_done)
                continue;

            feedback->sendQueued(data, when, untilRefreshNs, seq, reportedFlags);
        }
    }

    if (m_feedbacks.size() > 10000) {
        LOGM(Log::ERR, "FIXME: presentation has a feedback leak, and has grown to {} pending entries!!! Dropping!!!!!", m_feedbacks.size());

        // Move the elements from the 9000th position to the end of the vector.
        std::vector<UP<CPresentationFeedback>> newFeedbacks;
        newFeedbacks.reserve(m_feedbacks.size() - 9000);

        for (auto it = m_feedbacks.begin() + 9000; it != m_feedbacks.end(); ++it) {
            newFeedbacks.push_back(std::move(*it));
        }

        m_feedbacks = std::move(newFeedbacks);
    }

    std::erase_if(m_feedbacks, [](const auto& other) { return !other->m_surface || other->m_done; });
    std::erase_if(m_queue, [pMonitor](const auto& other) {
        return !other->m_surface || !other->m_monitor || isSamePresentedOutput(other->m_monitor.lock(), pMonitor);
    });
}

void CPresentationProtocol::queueData(UP<CQueuedPresentationData>&& data) {
    m_queue.emplace_back(std::move(data));
}

void CPresentationProtocol::discardFeedbacks(std::vector<WP<CPresentationFeedback>>& feedbacks) {
    for (auto const& feedback : feedbacks) {
        if (!feedback || feedback->m_done)
            continue;

        feedback->sendDiscarded();
    }

    feedbacks.clear();
    std::erase_if(m_feedbacks, [](const auto& other) { return !other->m_surface || other->m_done; });
}

void CPresentationProtocol::discardFeedbacksForSurface(WP<CWLSurfaceResource> surface) {
    if (!surface)
        return;

    for (auto const& feedback : m_feedbacks) {
        if (feedback->m_surface != surface)
            continue;

        feedback->sendDiscarded();
    }

    std::erase_if(m_queue, [surface](const auto& other) { return !other->m_surface || other->m_surface == surface; });
    std::erase_if(m_feedbacks, [](const auto& other) { return !other->m_surface || other->m_done; });
}

bool CPresentationProtocol::hasPendingFeedbacks() const {
    return !m_feedbacks.empty();
}
