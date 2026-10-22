#include "ScreenshareManager.hpp"
#include "WorkspaceCaptureSource.hpp"
#include "../../pointer/PointerManager.hpp"
#include "../SeatManager.hpp"
#include "../SessionLockManager.hpp"
#include "../permissions/DynamicPermissionManager.hpp"
#include "../../protocols/ColorManagement.hpp"
#include "../../Compositor.hpp"
#include "../../render/Renderer.hpp"
#include "../../render/SceneResources.hpp"
#include "../../render/scene/SceneSelection.hpp"
#include "../../render/OpenGL.hpp"
#include "../../output/Monitor.hpp"
#include "../../state/MonitorState.hpp"
#include "../../workspace/HLWorkspace.hpp"
#include "../../desktop/view/window/Window.hpp"
#include "../../desktop/view/window/WindowPresentation.hpp"
#include "../../desktop/state/FocusState.hpp"
#include "../../render/pass/ClearPassElement.hpp"
#include "../../render/pass/RectPassElement.hpp"
#include "helpers/cm/ColorManagement.hpp"
#include "../../managers/fullscreen/FullscreenController.hpp"
#include <hyprutils/math/Region.hpp>
#include <hyprgraphics/egl/Egl.hpp>
#include <hyprland-workspace-image-capture-source-v1.hpp>

using namespace Hyprgraphics::Egl;
using namespace Screenshare;
using namespace Desktop::View;

static CBox noScreenShareBoxForMonitor(PHLMONITOR pMonitor, const CBox& captureBox, const CBox& logicalBox) {
    return logicalBox.copy().translate(-pMonitor->m_position).scale(pMonitor->m_scale).translate(-captureBox.pos());
}

static bool boxTouchesBuffer(const CBox& box, const Vector2D& bufferSize) {
    return !box.intersection(CBox{{}, bufferSize}).empty();
}

static bool shouldMaskNoScreenShareWindow(PHLWINDOW pWindow, PHLMONITOR pMonitor) {
    if (!pWindow->m_ruleApplicator->noScreenShare().valueOrDefault())
        return false;

    if (!pWindow->presentation().visibleOnMonitor(pMonitor))
        return false;

    if (pWindow->isHidden())
        return false;

    if (g_pHyprRenderer->shouldRenderWindow(pWindow, pMonitor))
        return true;

    const auto PWINDOWMONITOR = pWindow->m_monitor.lock();
    if (!PWINDOWMONITOR || PWINDOWMONITOR == pMonitor || PWINDOWMONITOR->physicalMonitor() != pMonitor)
        return false;

    const auto PWORKSPACE = pWindow->m_workspace;
    if (!PWORKSPACE)
        return false;

    if (pWindow->m_state & WINDOW_STATE_PINNED)
        return true;

    // Physical monitor captures use the parent output texture. Tiled windows that belong
    // to a virtual child monitor are visible in that texture, but shouldRenderWindow()
    // rejects them for the physical parent because their workspace monitor differs.
    return PWORKSPACE && PWORKSPACE->visible();
}

CScreenshareFrame::CScreenshareFrame(WP<CScreenshareSession> session, bool overlayCursor, bool isFirst) :
    m_session(session), m_bufferSize(m_session->bufferSize()), m_overlayCursor(overlayCursor), m_isFirst(isFirst) {
    const auto PMONITOR = m_session->monitor();
    LOG(Log::TRACE, "[SSDBG] frame ctor type={} mon={} id={} virt={} physical={} pos={} size={} pix={} capture={} {} {} {} buffer={} overlay={} first={}",
        sc<int>(m_session->m_type), PMONITOR ? PMONITOR->m_name : "<none>", PMONITOR ? PMONITOR->m_id : -1, PMONITOR ? PMONITOR->isVirtual() : false,
        PMONITOR && PMONITOR->physicalMonitor() ? PMONITOR->physicalMonitor()->m_name : "<none>", PMONITOR ? PMONITOR->m_position : Vector2D{},
        PMONITOR ? PMONITOR->m_size : Vector2D{}, PMONITOR ? PMONITOR->m_pixelSize : Vector2D{}, m_session->m_captureBox.x, m_session->m_captureBox.y, m_session->m_captureBox.w,
        m_session->m_captureBox.h, m_bufferSize, m_overlayCursor, m_isFirst);
}

CScreenshareFrame::~CScreenshareFrame() {
    if (m_failed || !m_shared)
        return;

    if (!m_copied && m_callback) {
        FScreenshareCallback cb;
        std::swap(cb, m_callback);
        cb(RESULT_NOT_COPIED);
    }
}

bool CScreenshareFrame::done() const {
    if (m_session.expired() || m_session->m_stopped)
        return true;

    if (m_session->m_type == SHARE_NONE || m_bufferSize == Vector2D(0, 0))
        return true;

    if (m_failed || m_copied)
        return true;

    if (m_session->m_type == SHARE_MONITOR && !m_session->monitor())
        return true;

    if (m_session->m_type == SHARE_REGION && !m_session->monitor())
        return true;

    if (m_session->m_type == SHARE_WORKSPACE && !m_session->monitor())
        return true;

    if (m_session->m_type == SHARE_WINDOW && (!m_session->monitor() || !validMapped(m_session->m_window)))
        return true;

    if (!m_shared)
        return false;

    if (!m_buffer || !m_buffer->m_resource || !m_buffer->m_resource->good())
        return true;

    if (!m_callback)
        return true;

    return false;
}

void CScreenshareFrame::fail() {
    if (m_failed || m_copied)
        return;

    m_failed = true;

    if (m_shared && m_callback)
        m_callback(RESULT_NOT_COPIED);
}

eScreenshareError CScreenshareFrame::share(SP<IHLBuffer> buffer, const CRegion& clientDamage, FScreenshareCallback callback) {
    if UNLIKELY (done())
        return ERROR_STOPPED;

    if UNLIKELY (!m_session->monitor() || !State::monitorState()->contains(m_session->monitor())) {
        LOG(Log::ERR, "Client requested sharing of a monitor that is gone");
        m_failed = true;
        return ERROR_STOPPED;
    }

    if UNLIKELY (m_session->m_type == SHARE_WINDOW && !validMapped(m_session->m_window)) {
        LOG(Log::ERR, "Client requested sharing of window that is gone or not shareable!");
        m_failed = true;
        return ERROR_STOPPED;
    }

    if UNLIKELY (!buffer || !buffer->m_resource || !buffer->m_resource->good() || !buffer->good()) {
        LOG(Log::ERR, "Client requested sharing to an invalid buffer");
        return ERROR_NO_BUFFER;
    }

    if UNLIKELY (m_bufferSize != m_session->bufferSize()) {
        LOG(Log::ERR, "Client requested sharing with stale buffer constraints");
        return ERROR_BUFFER_SIZE;
    }

    if UNLIKELY (buffer->size != m_bufferSize) {
        LOG(Log::ERR, "Client requested sharing to an invalid buffer size");
        return ERROR_BUFFER_SIZE;
    }

    uint32_t bufFormat;
    if (buffer->dmabuf().success)
        bufFormat = buffer->dmabuf().format;
    else if (buffer->shm().success)
        bufFormat = buffer->shm().format;
    else {
        LOG(Log::ERR, "Client requested sharing to an invalid buffer");
        return ERROR_NO_BUFFER;
    }

    if (std::ranges::count_if(m_session->allowedFormats(), [&](const DRMFormat& format) { return format == bufFormat; }) == 0) {
        LOG(Log::ERR, "Invalid format {} in {:x}", bufFormat, (uintptr_t)this);
        return ERROR_BUFFER_FORMAT;
    }

    auto       CLIENT_DAMAGE         = clientDamage;
    const auto CLIENT_DAMAGE_EXTENTS = CLIENT_DAMAGE.getExtents();
    LOG(Log::TRACE, "[SSDBG] frame share accepted type={} mon={} bufSize={} bufferFormat={} allowedFormats={} clientDamage={} {} {} {} first={} overlay={}",
        sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>", m_bufferSize, bufFormat, m_session->allowedFormats().size(),
        CLIENT_DAMAGE_EXTENTS.x, CLIENT_DAMAGE_EXTENTS.y, CLIENT_DAMAGE_EXTENTS.w, CLIENT_DAMAGE_EXTENTS.h, m_isFirst, m_overlayCursor);

    m_buffer   = buffer;
    m_callback = callback;
    m_shared   = true;

    if (m_session->m_type == SHARE_MONITOR || m_session->m_type == SHARE_REGION) {
        const auto PMONITOR = m_session->monitor();
        if (PMONITOR)
            PMONITOR->addDamage(PMONITOR->resources()->pendingMirrorFBDamage());
    }

    // schedule a frame so that when a screenshare starts it isn't black until the output is updated
    if (m_isFirst || m_session->m_type == SHARE_WORKSPACE) {
        const auto PMONITOR = m_session->monitor();
        if (PMONITOR)
            PMONITOR->scheduleFrame(Aquamarine::IOutput::AQ_SCHEDULE_NEEDS_FRAME);
        g_pHyprRenderer->damageMonitor(PMONITOR);
    }

    // TODO: add a damage ring for output damage since last shared frame
    CRegion frameDamage = CRegion(0, 0, m_bufferSize.x, m_bufferSize.y);

    // copy everything on the first frame
    if (m_isFirst)
        m_damage = CRegion(0, 0, m_bufferSize.x, m_bufferSize.y);
    else
        m_damage = frameDamage.add(clientDamage);

    m_damage.intersect(0, 0, m_bufferSize.x, m_bufferSize.y);

    if ((m_session->m_type == SHARE_MONITOR || m_session->m_type == SHARE_REGION) && hasNoScreenShareOverlays(m_session->monitor())) {
        // Privacy masks must be included in the copied damage. Without this, an incremental
        // screencast frame can render the black cover locally but never copy it to PipeWire.
        m_damage = CRegion(0, 0, m_bufferSize.x, m_bufferSize.y);
    }

    const auto DAMAGE_EXTENTS = m_damage.getExtents();
    LOG(Log::TRACE, "[SSDBG] frame share damage type={} mon={} damage={} {} {} {}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>",
        DAMAGE_EXTENTS.x, DAMAGE_EXTENTS.y, DAMAGE_EXTENTS.w, DAMAGE_EXTENTS.h);

    return ERROR_NONE;
}

void CScreenshareFrame::copy() {
    if (g_pHyprRenderer->context().active() || done() || m_copyInFlight) {
        LOG(Log::TRACE, "[SSDBG] frame copy skipped type={} mon={} shared={} copied={} failed={} inFlight={} ctxActive={}",
            m_session.expired() ? sc<int>(SHARE_NONE) : sc<int>(m_session->m_type), !m_session.expired() && m_session->monitor() ? m_session->monitor()->m_name : "<none>",
            m_shared, m_copied, m_failed, m_copyInFlight, g_pHyprRenderer->context().active());
        return;
    }

    // tell client to send presented timestamp
    // TODO: is this right? this is right after we commit to aq, not when page flip happens..
    m_callback(RESULT_TIMESTAMP);

    if (g_pHyprRenderer->context().active())
        return;

    // store a snapshot before the permission popup so we don't break screenshots
    const auto PERM = g_pDynamicPermissionManager->clientPermissionMode(m_session->m_client, PERMISSION_TYPE_SCREENCOPY);
    LOG(Log::TRACE, "[SSDBG] frame copy start type={} mon={} perm={} shm={} dmabuf={} damage={} {} {} {}", sc<int>(m_session->m_type),
        m_session->monitor() ? m_session->monitor()->m_name : "<none>", sc<int>(PERM), m_buffer && m_buffer->shm().success, m_buffer && m_buffer->dmabuf().success,
        m_damage.getExtents().x, m_damage.getExtents().y, m_damage.getExtents().w, m_damage.getExtents().h);
    if (PERM == PERMISSION_RULE_ALLOW_MODE_PENDING) {
        if (m_session->m_type != SHARE_WORKSPACE && (!m_session->m_tempFB || !m_session->m_tempFB->isAllocated()))
            storeTempFB();

        // don't copy a frame while allow is pending because screenshot tools will only take the first frame we give, which is empty
        LOG(Log::TRACE, "[SSDBG] frame copy paused permission pending type={} mon={}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>");
        return;
    }

    if (m_session->m_type == SHARE_WORKSPACE && (PERM == PERMISSION_RULE_ALLOW_MODE_DENY || m_bufferSize != m_session->bufferSize())) {
        m_failed = true;
        m_callback(RESULT_NOT_COPIED);
        return;
    }

    if (m_buffer->shm().success)
        m_failed = !copyShm();
    else if (m_buffer->dmabuf().success)
        m_failed = !copyDmabuf();

    if (!m_failed) {
        // screensharing has started again
        m_session->screenshareEvents(true);
        m_session->m_shareStopTimer->updateTimeout(std::chrono::milliseconds(500)); // check in half second
        LOG(Log::TRACE, "[SSDBG] frame copy success type={} mon={} copied={}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>",
            m_copied);
    } else {
        LOG(Log::TRACE, "[SSDBG] frame copy failed type={} mon={}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>");
        m_callback(RESULT_NOT_COPIED);
    }
}

bool CScreenshareFrame::hasNoScreenShareOverlays(PHLMONITOR pMonitor) {
    if (!pMonitor)
        return false;

    for (auto const& l : Desktop::layerState()->layers()) {
        if (!l->m_ruleApplicator->noScreenShare().valueOrDefault())
            continue;

        if UNLIKELY (!l->mapped() || !l->acceptsInput() || !l->alphaNonZero())
            continue;

        const auto REALPOS  = l->position(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
        const auto REALSIZE = l->size(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
        const auto BOX      = noScreenShareBoxForMonitor(pMonitor, m_session->m_captureBox, CBox{REALPOS.x, REALPOS.y, std::max(REALSIZE.x, 5.0), std::max(REALSIZE.y, 5.0)});

        if (boxTouchesBuffer(BOX, m_bufferSize))
            return true;
    }

    for (auto const& w : Desktop::windowState()->windows()) {
        if (!shouldMaskNoScreenShareWindow(w, pMonitor))
            continue;

        const auto PWORKSPACE = w->m_workspace;

        if UNLIKELY (!PWORKSPACE && w->presentation().alphaValue(WINDOW_ALPHA_FADE) * w->presentation().alphaValue(WINDOW_ALPHA_FULLSCREEN) != 0.f)
            continue;

        const auto renderOffset = PWORKSPACE && !(w->m_state & WINDOW_STATE_PINNED) ? PWORKSPACE->m_renderOffset->value() : Vector2D{};
        const auto REALSIZE     = w->size(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
        const auto REALPOS      = w->position(Desktop::View::IGeometric::GEOMETRIC_CURRENT) + renderOffset;
        const auto BOX          = noScreenShareBoxForMonitor(pMonitor, m_session->m_captureBox, CBox{REALPOS.x, REALPOS.y, std::max(REALSIZE.x, 5.0), std::max(REALSIZE.y, 5.0)});

        if (boxTouchesBuffer(BOX, m_bufferSize))
            return true;
    }

    return false;
}

void CScreenshareFrame::renderNoScreenShareOverlays(Render::CRenderContext& ctx, PHLMONITOR pMonitor) {
    if (!pMonitor)
        return;

    // user intent -> strategy: privacy masks must cover the sensitive surface in the COPIED frame.
    // Virtual (split) monitor captures render their windows through the deferred render pass
    // which only flushes at endRender(); an immediate g_pHyprRenderer->draw() here would paint
    // the mask BEFORE those windows, so the windows then composite on top and the mask vanishes
    // (works on physical monitors only because their mirror texture is drawn immediately too).
    // Enqueue the masks into the same pass, after the scene, so they stay on top on both
    // physical and virtual captures.
    auto maskRect = [&ctx](const CRectPassElement::SRectData& data) { g_pHyprRenderer->addPassElement(ctx, makeUnique<CRectPassElement>(data)); };

    // Draw these after the real scene so monitor/region captures hide sensitive surfaces.
    auto hidePopups = [&](Vector2D popupBaseOffset) {
        return [&, popupBaseOffset](WP<Desktop::View::CPopup> popup, void*) {
            if (!popup->wlSurface() || !popup->wlSurface()->resource() || !popup->mapped() || !popup->acceptsInput() || !popup->alphaNonZero())
                return;

            const auto popRel = popup->coordsRelativeToParent();
            popup->wlSurface()->resource()->breadthfirst(
                [&](SP<CWLSurfaceResource> surf, const Vector2D& localOff, void*) {
                    const auto size    = surf->m_current.size;
                    const auto surfBox = noScreenShareBoxForMonitor(pMonitor, m_session->m_captureBox, CBox{popupBaseOffset + popRel + localOff, size});

                    if LIKELY (surfBox.w > 0 && surfBox.h > 0)
                        maskRect(CRectPassElement::SRectData{.box = surfBox, .color = Colors::BLACK});
                },
                nullptr);
        };
    };

    for (auto const& l : Desktop::layerState()->layers()) {
        if (!l->m_ruleApplicator->noScreenShare().valueOrDefault())
            continue;

        if UNLIKELY (!l->mapped() || !l->acceptsInput() || !l->alphaNonZero())
            continue;

        const auto REALPOS  = l->position(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
        const auto REALSIZE = l->size(Desktop::View::IGeometric::GEOMETRIC_CURRENT);

        const auto noScreenShareBox =
            noScreenShareBoxForMonitor(pMonitor, m_session->m_captureBox, CBox{REALPOS.x, REALPOS.y, std::max(REALSIZE.x, 5.0), std::max(REALSIZE.y, 5.0)});

        maskRect(CRectPassElement::SRectData{.box = noScreenShareBox, .color = Colors::BLACK});

        const auto     geom            = l->m_geometry;
        const Vector2D popupBaseOffset = REALPOS - Vector2D{geom.pos().x, geom.pos().y};
        if (l->popupHead())
            l->popupHead()->breadthfirst(hidePopups(popupBaseOffset), nullptr);
    }

    for (auto const& w : Desktop::windowState()->windows()) {
        if (!shouldMaskNoScreenShareWindow(w, pMonitor))
            continue;

        const auto PWORKSPACE = w->m_workspace;

        if UNLIKELY (!PWORKSPACE && w->presentation().alphaValue(WINDOW_ALPHA_FADE) * w->presentation().alphaValue(WINDOW_ALPHA_FULLSCREEN) != 0.f)
            continue;

        const auto renderOffset = PWORKSPACE && !(w->m_state & WINDOW_STATE_PINNED) ? PWORKSPACE->m_renderOffset->value() : Vector2D{};
        const auto REALSIZE     = w->size(Desktop::View::IGeometric::GEOMETRIC_CURRENT);
        const auto REALPOS      = w->position(Desktop::View::IGeometric::GEOMETRIC_CURRENT) + renderOffset;
        const auto noScreenShareBox =
            noScreenShareBoxForMonitor(pMonitor, m_session->m_captureBox, CBox{REALPOS.x, REALPOS.y, std::max(REALSIZE.x, 5.0), std::max(REALSIZE.y, 5.0)});

        // Rounding can leak pixels when a region capture shifts the mask relative to the output.
        const auto dontRound     = m_session->m_captureBox.pos() != Vector2D() || Fullscreen::controller()->isFullscreen(w, Fullscreen::FSMODE_FULLSCREEN);
        const auto rounding      = dontRound ? 0 : w->presentation().rounding() * pMonitor->m_scale;
        const auto roundingPower = dontRound ? 2.0f : w->presentation().roundingPower();
        maskRect(CRectPassElement::SRectData{
            .box           = noScreenShareBox,
            .color         = Colors::BLACK,
            .round         = rounding,
            .roundingPower = roundingPower,
        });

        if (w->backend().isX11() || !w->popupHead())
            continue;

        const auto     GEOM            = w->backend().geometry().box;
        const Vector2D popupBaseOffset = REALPOS - GEOM.pos();

        w->popupHead()->breadthfirst(hidePopups(popupBaseOffset), nullptr);
    }
}

void CScreenshareFrame::renderOverlayCursor(Render::CRenderContext& ctx, PHLMONITOR pMonitor) {
    if (!m_overlayCursor || !pMonitor)
        return;

    CRegion  fakeDamage = {0, 0, m_bufferSize.x, m_bufferSize.y};
    Vector2D cursorPos  = Pointer::mgr()->untransformedPosition() - pMonitor->m_position - m_session->m_captureBox.pos() / pMonitor->m_scale;
    Pointer::mgr()->renderSoftwareCursorsFor(ctx, pMonitor, Time::steadyNow(), fakeDamage, cursorPos, true, pMonitor->isVirtual());
}

void CScreenshareFrame::renderMonitor(Render::CRenderContext& ctx) {
    if ((m_session->m_type != SHARE_MONITOR && m_session->m_type != SHARE_REGION) || done())
        return;

    const auto PMONITOR       = m_session->monitor();
    const auto SOURCE_MONITOR = PMONITOR->physicalMonitor();
    LOG(Log::TRACE, "[SSDBG] renderMonitor start type={} mon={} id={} virt={} physical={} pos={} size={} pix={} capture={} {} {} {} renderMon={} fbSize={}",
        sc<int>(m_session->m_type), PMONITOR ? PMONITOR->m_name : "<none>", PMONITOR ? PMONITOR->m_id : -1, PMONITOR ? PMONITOR->isVirtual() : false,
        SOURCE_MONITOR ? SOURCE_MONITOR->m_name : "<none>", PMONITOR ? PMONITOR->m_position : Vector2D{}, PMONITOR ? PMONITOR->m_size : Vector2D{},
        PMONITOR ? PMONITOR->m_pixelSize : Vector2D{}, m_session->m_captureBox.x, m_session->m_captureBox.y, m_session->m_captureBox.w, m_session->m_captureBox.h,
        ctx.m_data.pMonitor ? ctx.m_data.pMonitor->m_name : "<none>", ctx.m_data.fbSize);
    if (!SOURCE_MONITOR) {
        LOG(Log::ERR, "Invalid source monitor");
        return;
    }
    const bool IS_CM_AWARE     = PROTO::colorManagement && PROTO::colorManagement->isClientCMAware(m_session->m_client);
    ctx.m_data.transformDamage = false;
    ctx.m_data.noSimplify      = true;

    auto TEXTURE = SOURCE_MONITOR->resources()->getMirrorTexture();
    if (!TEXTURE) {
        if (!PMONITOR->isVirtual()) {
            LOG(Log::ERR, "Invalid source texture");
            return;
        }

        // first frame can race the parent copy-FB; compose the logical slice instead of sending black
        LOG(Log::TRACE, "[SSDBG] renderMonitor virtual fallback (no parent mirror) mon={} physical={}", PMONITOR->m_name, SOURCE_MONITOR->m_name);

        ctx.m_data.fbSize = m_bufferSize;
        g_pHyprRenderer->setProjectionType(ctx, Render::RPT_EXPORT);
        g_pHyprRenderer->setViewport(0, 0, m_bufferSize.x, m_bufferSize.y);

        const auto OLD                 = ctx.m_data.renderModif.enabled;
        ctx.m_data.renderModif.enabled = false;
        g_pHyprRenderer->renderLogicalMonitorForScreencopy(ctx, PMONITOR, Time::steadyNow());
        ctx.m_data.renderModif.enabled = OLD;
        renderNoScreenShareOverlays(ctx, PMONITOR);
        renderOverlayCursor(ctx, PMONITOR);
        return;
    }

    if (!TEXTURE->m_imageDescription)
        LOG(Log::ERR, "CM: FIXME no source image description for screenshare");

    if (!ctx.m_data.currentFB->imageDescription())
        LOG(Log::ERR, "CM: FIXME no target image description for screenshare");

    if (TEXTURE->m_imageDescription && ctx.m_data.currentFB->imageDescription())
        LOG(Log::TRACE, "CM: screenshot renderMonitor {} -> {}", TEXTURE->m_imageDescription->value(), ctx.m_data.currentFB->imageDescription()->value());

    ctx.m_data.fbSize = m_bufferSize;
    g_pHyprRenderer->setProjectionType(ctx, Render::RPT_EXPORT);
    g_pHyprRenderer->setViewport(0, 0, m_bufferSize.x, m_bufferSize.y);

    // user intent -> strategy: Xiaomi ~1/~2 are slices of one physical FB. Capture by
    // offsetting into the parent mirror instead of re-rendering the virtual scene.
    Vector2D captureOrigin = m_session->m_captureBox.pos();
    if (PMONITOR->isVirtual())
        captureOrigin += ((PMONITOR->m_position - SOURCE_MONITOR->m_position) * SOURCE_MONITOR->m_scale).round();

    CBox monbox = CBox{{}, SOURCE_MONITOR->m_transformedSize}.translate(-captureOrigin);

    LOG(Log::TRACE, "[SSDBG] renderMonitor physical mirror source={} sessionMon={} virt={} mirrorBox={} {} {} {} textureSize={}", SOURCE_MONITOR->m_name, PMONITOR->m_name,
        PMONITOR->isVirtual(), monbox.x, monbox.y, monbox.w, monbox.h, TEXTURE ? TEXTURE->m_size : Vector2D{});

    const auto OLD                 = ctx.m_data.renderModif.enabled;
    ctx.m_data.renderModif.enabled = false;
    g_pHyprRenderer->startRenderPass(ctx);
    g_pHyprRenderer->draw(ctx,
                          CTexPassElement::SRenderData{
                              .tex          = TEXTURE,
                              .box          = monbox,
                              .cmBackToSRGB = !IS_CM_AWARE,
                          },
                          {0, 0, m_bufferSize.x, m_bufferSize.y});
    ctx.m_data.renderModif.enabled = OLD;

    renderNoScreenShareOverlays(ctx, PMONITOR);
    renderOverlayCursor(ctx, PMONITOR);
}

void CScreenshareFrame::renderWindow(Render::CRenderContext& ctx) {
    if (m_session->m_type != SHARE_WINDOW || done())
        return;

    const auto PWINDOW  = m_session->m_window.lock();
    const auto PMONITOR = m_session->monitor();

    const auto NOW = Time::steadyNow();

    // TODO: implement a monitor independent render mode to buffer that does this in CHyprRenderer::begin() or something like that
    ctx.m_data.fbSize = m_bufferSize;
    g_pHyprRenderer->setProjectionType(ctx, Render::RPT_EXPORT);
    ctx.m_data.transformDamage = false;
    g_pHyprRenderer->setViewport(0, 0, m_bufferSize.x, m_bufferSize.y);

    ctx.m_blockSurfaceFeedback = g_pHyprRenderer->shouldRenderWindow(PWINDOW); // block the feedback to avoid spamming the surface if it's visible
    g_pHyprRenderer->renderWindow(ctx, PWINDOW, PMONITOR, PWINDOW->presentation().renderPresentation(nullptr), NOW, false, Render::RENDER_PASS_ALL, true, true);
    ctx.m_blockSurfaceFeedback = false;

    if (!m_overlayCursor)
        return;

    auto pointerSurfaceResource = g_pSeatManager->m_state.pointerFocus.lock();

    if (!pointerSurfaceResource)
        return;

    auto pointerSurface = Desktop::View::CWLSurface::fromResource(pointerSurfaceResource);
    if (!pointerSurface)
        return;

    auto box = pointerSurface->getSurfaceBoxGlobal();
    if (!box.has_value() || box->intersection(m_session->m_window->getFullWindowBoundingBox()).empty())
        return;

    if (Desktop::focusState()->window() != m_session->m_window)
        return;

    CRegion fakeDamage = {0, 0, INT16_MAX, INT16_MAX};
    Pointer::mgr()->renderSoftwareCursorsFor(ctx, PMONITOR->m_self.lock(), NOW, fakeDamage,
                                             Pointer::mgr()->untransformedPosition() - PWINDOW->position(Desktop::View::IGeometric::GEOMETRIC_CURRENT), true, true);
}

void CScreenshareFrame::renderWorkspace(Render::CRenderContext& ctx) {
    const auto WORKSPACE = m_session->m_workspace->workspace();
    const auto MONITOR   = ctx.m_data.pMonitor.lock();
    if (!WORKSPACE || WORKSPACE->m_monitor != MONITOR || g_pSessionLockManager->isSessionLocked())
        return;

    const auto MODE = m_session->m_workspace->mode() == HYPRLAND_WORKSPACE_IMAGE_CAPTURE_SOURCE_MANAGER_V1_CAPTURE_MODE_WINDOWS_ONLY ? Render::eSceneMode::WORKSPACE_WINDOWS :
                                                                                                                                       Render::eSceneMode::WORKSPACE_WITH_SHELL;
    const auto NOW  = Time::steadyNow();
    g_pHyprRenderer->startRenderPass(ctx);
    g_pHyprRenderer->renderWorkspace(ctx, WORKSPACE, NOW, MODE);

    if (!m_overlayCursor || (MONITOR->m_activeWorkspace != WORKSPACE && MONITOR->m_activeSpecialWorkspace != WORKSPACE))
        return;

    CRegion damage{0, 0, m_bufferSize.x, m_bufferSize.y};
    Pointer::mgr()->renderSoftwareCursorsFor(ctx, MONITOR, NOW, damage, Pointer::mgr()->untransformedPosition() - MONITOR->m_position, true, true);
}

void CScreenshareFrame::render(Render::CRenderContext& ctx) {
    const auto PERM = g_pDynamicPermissionManager->clientPermissionMode(m_session->m_client, PERMISSION_TYPE_SCREENCOPY);

    // Removed sources keep their last export size even if the output changes size.
    // Clear all scene scratch, not just the frozen export rectangle.
    const auto CLEAR_SIZE     = m_session->m_type == SHARE_WORKSPACE ? ctx.m_data.currentFB->m_size : m_bufferSize;
    CRegion    frameRegion    = {0, 0, CLEAR_SIZE.x, CLEAR_SIZE.y};
    const auto FRAME_EXTENTS  = frameRegion.getExtents();
    const auto DAMAGE_EXTENTS = m_damage.getExtents();
    LOG(Log::TRACE, "[SSDBG] render enter type={} mon={} perm={} buffer={} renderMon={} renderPix={} fbSize={} frameRegion={} {} {} {} damage={} {} {} {}",
        sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>", sc<int>(PERM), m_bufferSize,
        ctx.m_data.pMonitor ? ctx.m_data.pMonitor->m_name : "<none>", ctx.m_data.pMonitor ? ctx.m_data.pMonitor->m_pixelSize : Vector2D{}, ctx.m_data.fbSize, FRAME_EXTENTS.x,
        FRAME_EXTENTS.y, FRAME_EXTENTS.w, FRAME_EXTENTS.h, DAMAGE_EXTENTS.x, DAMAGE_EXTENTS.y, DAMAGE_EXTENTS.w, DAMAGE_EXTENTS.h);

    g_pHyprRenderer->draw(ctx, CClearPassElement::SClearData{{0, 0, 0, 0}}, frameRegion);

    if (m_session->m_type == SHARE_WORKSPACE) {
        if (PERM == PERMISSION_RULE_ALLOW_MODE_ALLOW)
            renderWorkspace(ctx);
        return;
    }

    if (PERM == PERMISSION_RULE_ALLOW_MODE_PENDING) {
        LOG(Log::TRACE, "[SSDBG] render stop permission pending type={} mon={}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>");
        return;
    }

    bool windowShareDenied = m_session->m_type == SHARE_WINDOW && m_session->m_window->m_ruleApplicator && m_session->m_window->m_ruleApplicator->noScreenShare().valueOrDefault();
    g_pHyprRenderer->startRenderPass(ctx);
    if (PERM == PERMISSION_RULE_ALLOW_MODE_DENY || windowShareDenied) {
        LOG(Log::TRACE, "[SSDBG] render denied texture type={} mon={} perm={} windowDenied={}", sc<int>(m_session->m_type),
            m_session->monitor() ? m_session->monitor()->m_name : "<none>", sc<int>(PERM), windowShareDenied);
        CBox texbox = CBox{m_bufferSize / 2.F, g_pHyprRenderer->m_screencopyDeniedTexture->m_size}.translate(-g_pHyprRenderer->m_screencopyDeniedTexture->m_size / 2.F);
        g_pHyprRenderer->draw(ctx, CTexPassElement::SRenderData{.tex = g_pHyprRenderer->m_screencopyDeniedTexture, .box = texbox}, texbox);
        return;
    }

    if (m_session->m_tempFB && m_session->m_tempFB->isAllocated()) {
        LOG(Log::TRACE, "[SSDBG] render tempFB type={} mon={} buffer={}", sc<int>(m_session->m_type), m_session->monitor() ? m_session->monitor()->m_name : "<none>", m_bufferSize);
        CBox texbox = {{}, m_bufferSize};
        g_pHyprRenderer->draw(ctx, CTexPassElement::SRenderData{.tex = m_session->m_tempFB->getTexture(), .box = texbox}, texbox);
        m_session->m_tempFB->release();
        return;
    }

    switch (m_session->m_type) {
        case SHARE_REGION: // TODO: could this be better? this is how screencopy works
        case SHARE_MONITOR: renderMonitor(ctx); break;
        case SHARE_WINDOW: renderWindow(ctx); break;
        case SHARE_NONE:
        default: return;
    }
}

bool CScreenshareFrame::beginCopy(SP<Render::IFramebuffer> framebuffer) {
    const bool             WORKSPACE = m_session->m_type == SHARE_WORKSPACE;
    Render::SRenderOptions options;
    if (WORKSPACE) {
        if (!m_session->m_sceneResources)
            m_session->m_sceneResources = makeShared<Render::CSceneResources>(g_pHyprRenderer->createFB("workspace capture blur"),
                                                                              Render::SSceneBufferDescription{
                                                                                  .format           = DRM_FORMAT_ARGB8888,
                                                                                  .imageDescription = NColorManagement::DEFAULT_SRGB_IMAGE_DESCRIPTION,
                                                                              });
        options.sceneResources = m_session->m_sceneResources;
    }

    // beginRender may replace scene damage. Preserve the client's export damage.
    CRegion damage = m_damage;
    if (!g_pHyprRenderer->beginRender(m_session->monitor(), damage, framebuffer ? Render::RENDER_MODE_FULL_FAKE : Render::RENDER_MODE_TO_BUFFER, framebuffer ? nullptr : m_buffer,
                                      framebuffer, !WORKSPACE, options))
        return false;

    auto& ctx = g_pHyprRenderer->context();
    ctx.m_data.outFB->setImageDescription(NColorManagement::DEFAULT_SRGB_IMAGE_DESCRIPTION);
    ctx.m_data.blockScreenShader = true;
    ctx.m_renderingCapture       = WORKSPACE;
    ctx.m_blockSurfaceFeedback   = WORKSPACE;
    return true;
}

bool CScreenshareFrame::copyDmabuf() {
    if (g_pHyprRenderer->context().active() || done())
        return false;

    LOG(Log::TRACE, "[SSDBG] copyDmabuf begin mon={} buffer={} damage={} {} {} {}", m_session->monitor() ? m_session->monitor()->m_name : "<none>", m_bufferSize,
        m_damage.getExtents().x, m_damage.getExtents().y, m_damage.getExtents().w, m_damage.getExtents().h);

    if (!beginCopy()) {
        LOG(Log::ERR, "Can't copy: failed to begin rendering to dma frame");
        return false;
    }

    const auto OLDDEBUG                      = g_pHyprRenderer->m_screencopyDebugActive;
    bool       finishing                     = false;
    g_pHyprRenderer->m_screencopyDebugActive = true;
    const Render::CScopeGuard cleanup([&] {
        g_pHyprRenderer->m_screencopyDebugActive = OLDDEBUG;
        if (!finishing)
            g_pHyprRenderer->abortRender();
    });
    auto&                     ctx = g_pHyprRenderer->context();
    LOG(Log::TRACE, "[SSDBG] copyDmabuf beginRender ok renderMon={} fbSize={}", ctx.m_data.pMonitor ? ctx.m_data.pMonitor->m_name : "<none>", ctx.m_data.fbSize);

    render(ctx);

    m_copyInFlight = true;

    finishing = true;
    g_pHyprRenderer->endRender([self = m_self]() {
        if (!self || self.expired())
            return;

        self->m_copyInFlight = false;

        if (self->m_copied)
            return;

        LOG(Log::TRACE, "Copied frame via dma");
        // The session can die while the copy is in flight (DPMS off disconnects the
        // monitor -> session stop), so the fence callback must not assume it is alive.
        LOG(Log::TRACE, "[SSDBG] copyDmabuf endRender callback copied mon={}",
            !self->m_session.expired() && self->m_session->monitor() ? self->m_session->monitor()->m_name : "<none>");
        self->m_callback(RESULT_COPIED);
        self->m_copied = true;
    });

    return true;
}

bool CScreenshareFrame::copyShm() {
    if (g_pHyprRenderer->context().active() || done())
        return false;

    auto       shm = m_buffer->shm();

    const auto PFORMAT = getPixelFormatFromDRM(shm.format);
    if (!PFORMAT) {
        LOG(Log::ERR, "Can't copy: failed to find a pixel format");
        return false;
    }

    const auto PMONITOR = m_session->monitor();

    LOG(Log::TRACE, "[SSDBG] copyShm begin mon={} buffer={} format={} damage={} {} {} {}", PMONITOR ? PMONITOR->m_name : "<none>", m_bufferSize, shm.format,
        m_damage.getExtents().x, m_damage.getExtents().y, m_damage.getExtents().w, m_damage.getExtents().h);

    auto outFB = g_pHyprRenderer->createFB();
    if (!outFB || !outFB->alloc(m_bufferSize.x, m_bufferSize.y, shm.format))
        return false;
    outFB->setImageDescription(NColorManagement::DEFAULT_SRGB_IMAGE_DESCRIPTION);

    if (!beginCopy(outFB)) {
        LOG(Log::ERR, "Can't copy: failed to begin rendering");
        return false;
    }

    {
        const auto OLDDEBUG                      = g_pHyprRenderer->m_screencopyDebugActive;
        bool       finishing                     = false;
        g_pHyprRenderer->m_screencopyDebugActive = true;
        const Render::CScopeGuard cleanup([&] {
            g_pHyprRenderer->m_screencopyDebugActive = OLDDEBUG;
            if (!finishing)
                g_pHyprRenderer->abortRender();
        });

        auto&                     ctx = g_pHyprRenderer->context();
        LOG(Log::TRACE, "[SSDBG] copyShm beginRender ok renderMon={} fbSize={} outFB={}", ctx.m_data.pMonitor ? ctx.m_data.pMonitor->m_name : "<none>", ctx.m_data.fbSize,
            m_bufferSize);

        render(ctx);

        finishing = true;
        g_pHyprRenderer->endRender();
    }

    bool readSucceeded = true;
    m_damage.forEachRect([&](const auto& rect) {
        if (!readSucceeded)
            return;

        int width  = rect.x2 - rect.x1;
        int height = rect.y2 - rect.y1;
        LOG(Log::TRACE, "[SSDBG] copyShm readPixels mon={} rect={} {} {} {}", PMONITOR ? PMONITOR->m_name : "<none>", rect.x1, rect.y1, width, height);
        if (!outFB->readPixels(m_buffer, rect.x1, rect.y1, width, height))
            readSucceeded = false;
    });

    if (!readSucceeded) {
        LOG(Log::ERR, "Can't copy: failed to read pixels to shm");
        return false;
    }

    if (!m_copied) {
        LOG(Log::TRACE, "Copied frame via shm");
        LOG(Log::TRACE, "[SSDBG] copyShm copied mon={}", PMONITOR ? PMONITOR->m_name : "<none>");
        m_callback(RESULT_COPIED);
        m_copied = true;
    }

    return true;
}

void CScreenshareFrame::storeTempFB() {
    if (g_pHyprRenderer->context().active())
        return;

    if (!m_session->m_tempFB)
        m_session->m_tempFB = g_pHyprRenderer->createFB();
    m_session->m_tempFB->alloc(m_bufferSize.x, m_bufferSize.y);
    m_session->m_tempFB->setImageDescription(NColorManagement::DEFAULT_SRGB_IMAGE_DESCRIPTION);

    CRegion fakeDamage = {0, 0, m_bufferSize.x, m_bufferSize.y};

    if (!g_pHyprRenderer->beginFullFakeRender(m_session->monitor(), fakeDamage, m_session->m_tempFB)) {
        LOG(Log::ERR, "Can't copy: failed to begin rendering to temp fb");
        return;
    }
    bool                      finishing = false;
    const Render::CScopeGuard cleanup([&] {
        if (!finishing)
            g_pHyprRenderer->abortRender();
    });

    auto&                     ctx = g_pHyprRenderer->context();
    switch (m_session->m_type) {
        case SHARE_REGION: // TODO: could this be better? this is how screencopy works
        case SHARE_MONITOR: renderMonitor(ctx); break;
        case SHARE_WINDOW: renderWindow(ctx); break;
        case SHARE_NONE:
        default: return;
    }

    finishing = true;
    g_pHyprRenderer->endRender();
}

Vector2D CScreenshareFrame::bufferSize() const {
    return m_bufferSize;
}

wl_output_transform CScreenshareFrame::transform() const {
    return WL_OUTPUT_TRANSFORM_NORMAL;
}

const CRegion& CScreenshareFrame::damage() const {
    return m_damage;
}
