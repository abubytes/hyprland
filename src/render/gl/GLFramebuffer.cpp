#include "GLFramebuffer.hpp"
#include "../OpenGL.hpp"
#include "../Renderer.hpp"
#include "macros.hpp"
#include "../Framebuffer.hpp"
#include <hyprgraphics/egl/Egl.hpp>
#include <cstring>
#include <fcntl.h>
#include <limits>
#include <sys/stat.h>

using namespace Hyprgraphics::Egl;
using namespace Render::GL;

static bool fitsInt32(uint32_t value) {
    return value <= sc<uint32_t>(std::numeric_limits<int32_t>::max());
}

static bool shmReadTargetValid(const Aquamarine::SSHMAttrs& shm, uint8_t* pixelData, size_t bufLen, const SPixelFormat* format, uint32_t targetX, uint32_t targetY,
                               uint32_t width, uint32_t height) {
    if (!pixelData || !shm.success || !format || width == 0 || height == 0 || shm.stride <= 0 || shm.offset < 0)
        return false;

    if (!fitsInt32(targetX) || !fitsInt32(targetY) || !fitsInt32(width) || !fitsInt32(height))
        return false;

    const auto XOFFSET  = minStride(format, sc<int32_t>(targetX));
    const auto ROWBYTES = minStride(format, sc<int32_t>(width));
    if (XOFFSET < 0 || ROWBYTES <= 0 || sc<uint64_t>(XOFFSET) + sc<uint64_t>(ROWBYTES) > sc<uint64_t>(shm.stride))
        return false;

    const auto RELATIVE_REQUIRED = sc<uint64_t>(targetY) * sc<uint64_t>(shm.stride) + sc<uint64_t>(XOFFSET) +
        sc<uint64_t>(height - 1) * sc<uint64_t>(shm.stride) + sc<uint64_t>(ROWBYTES);
    if (RELATIVE_REQUIRED > bufLen)
        return false;

    struct stat st;
    if (fstat(shm.fd, &st) != 0 || st.st_size < 0)
        return false;

    if (sc<uint64_t>(shm.offset) + RELATIVE_REQUIRED > sc<uint64_t>(st.st_size))
        return false;

    const auto FALLOCATE_RESULT = posix_fallocate(shm.fd, shm.offset, RELATIVE_REQUIRED);
    if (FALLOCATE_RESULT != 0) {
        LOGM(Log::ERR, "Can't copy: failed to reserve shm readPixels target: {}", std::strerror(FALLOCATE_RESULT));
        return false;
    }

    return true;
}

CGLFramebuffer::CGLFramebuffer() : IFramebuffer() {}
CGLFramebuffer::CGLFramebuffer(const std::string& name) : IFramebuffer(name) {}

bool CGLFramebuffer::internalAlloc(int w, int h, uint32_t drmFormat) {
    g_pHyprOpenGL->makeEGLCurrent();

    if (!m_tex) {
        m_tex = g_pHyprRenderer->createTexture();
        m_tex->allocate({w, h}, drmFormat);
        m_tex->bind();
        m_tex->setTexParameter(GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        m_tex->setTexParameter(GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        m_tex->setTexParameter(GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        m_tex->setTexParameter(GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    }

    if (!m_fbAllocated) {
        glGenFramebuffers(1, &m_fb);
        m_fbAllocated = true;
    }

    const auto format = getPixelFormatFromDRM(drmFormat);
    m_tex->bind();
    glTexImage2D(GL_TEXTURE_2D, 0, format->glInternalFormat ? format->glInternalFormat : format->glFormat, w, h, 0, format->glFormat, format->glType, nullptr);
    glBindFramebuffer(GL_FRAMEBUFFER, m_fb);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, m_tex->m_texID, 0);

    if (m_mirrorTex) {
        const auto format = getPixelFormatFromDRM(m_mirrorTex->m_drmFormat);
        m_mirrorTex->bind();
        glTexImage2D(GL_TEXTURE_2D, 0, format->glInternalFormat ? format->glInternalFormat : format->glFormat, w, h, 0, format->glFormat, format->glType, nullptr);
        glBindFramebuffer(GL_FRAMEBUFFER, m_fb);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D, m_mirrorTex->m_texID, 0);
    } else
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D, 0, 0);

    if (m_stencilTex && m_stencilTex->ok()) {
        m_stencilTex->bind();
        glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH24_STENCIL8, w, h, 0, GL_DEPTH_STENCIL, GL_UNSIGNED_INT_24_8, nullptr);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_TEXTURE_2D, m_stencilTex->m_texID, 0);

        glDisable(GL_DEPTH_TEST);
        glDepthMask(GL_FALSE);
    }

    auto status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    RASSERT((status == GL_FRAMEBUFFER_COMPLETE), "Framebuffer incomplete, couldn't create! (FB status: {}, GL Error: 0x{:x})", status, sc<int>(glGetError()));

    if (m_stencilTex && m_stencilTex->ok())
        m_stencilTex->unbind();

    Log::logger->log(Log::DEBUG, "Framebuffer \"{}\" created, status {}", m_name, status);

    glBindTexture(GL_TEXTURE_2D, 0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);

    return true;
}

void CGLFramebuffer::addStencil(SP<ITexture> tex) {
    if (m_stencilTex == tex)
        return;

    RASSERT(!m_fbAllocated, "Should add stencil tex prior to FB allocation")
    m_stencilTex = tex;
}

void CGLFramebuffer::bind() {
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, m_fb);

    if (g_pHyprOpenGL) {
        const auto& size = g_pHyprRenderer->m_renderData.pMonitor ? g_pHyprRenderer->m_renderData.pMonitor->m_pixelSize : m_size;
        g_pHyprOpenGL->setViewport(0, 0, size.x, size.y);
    } else
        glViewport(0, 0, m_size.x, m_size.y);
}

void CGLFramebuffer::unbind() {
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
}

void CGLFramebuffer::release() {
    if (m_fbAllocated) {
        glBindFramebuffer(GL_FRAMEBUFFER, m_fb);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, 0, 0);
        if (m_mirrorTex)
            glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT1, GL_TEXTURE_2D, 0, 0);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);

        glDeleteFramebuffers(1, &m_fb);
        m_fbAllocated = false;
        m_fb          = 0;
    }

    if (m_tex)
        m_tex.reset();

    m_size = Vector2D();
}

bool CGLFramebuffer::readPixels(CHLBufferReference buffer, uint32_t offsetX, uint32_t offsetY, uint32_t width, uint32_t height) {
    if UNLIKELY (!buffer || !buffer->good()) {
        LOGM(Log::ERR, "Can't copy: invalid readPixels target buffer");
        return false;
    }

    auto shm                      = buffer->shm();
    auto [pixelData, fmt, bufLen] = buffer->beginDataPtr(0); // no need for end, cuz it's shm

    if UNLIKELY (!shm.success) {
        LOGM(Log::ERR, "Can't copy: readPixels target is not a shm buffer");
        return false;
    }

    const auto READWIDTH  = width > 0 ? width : sc<uint32_t>(m_size.x);
    const auto READHEIGHT = height > 0 ? height : sc<uint32_t>(m_size.y);
    const auto FBW        = sc<uint64_t>(m_size.x);
    const auto FBH        = sc<uint64_t>(m_size.y);
    const auto BUFW       = sc<uint64_t>(buffer->size.x);
    const auto BUFH       = sc<uint64_t>(buffer->size.y);

    if UNLIKELY (READWIDTH == 0 || READHEIGHT == 0 || sc<uint64_t>(offsetX) + READWIDTH > FBW || sc<uint64_t>(offsetY) + READHEIGHT > FBH ||
                 sc<uint64_t>(offsetX) + READWIDTH > BUFW || sc<uint64_t>(offsetY) + READHEIGHT > BUFH) {
        LOGM(Log::ERR, "Can't copy: readPixels rectangle {} {} {} {} exceeds framebuffer {} or buffer {}", offsetX, offsetY, READWIDTH, READHEIGHT, m_size, buffer->size);
        return false;
    }

    const auto PFORMAT = getPixelFormatFromDRM(shm.format);
    if (!PFORMAT) {
        LOGM(Log::ERR, "Can't copy: failed to find a pixel format");
        return false;
    }

    if UNLIKELY (!shmReadTargetValid(shm, pixelData, bufLen, PFORMAT, offsetX, offsetY, READWIDTH, READHEIGHT)) {
        LOGM(Log::ERR, "Can't copy: readPixels shm target range is invalid");
        return false;
    }

    g_pHyprOpenGL->makeEGLCurrent();
    glBindFramebuffer(GL_READ_FRAMEBUFFER, getFBID());
    bind();

    glPixelStorei(GL_PACK_ALIGNMENT, 1);

    const auto PACKSTRIDE = minStride(PFORMAT, sc<int32_t>(READWIDTH));
    const auto XOFFSET    = minStride(PFORMAT, sc<int32_t>(offsetX));
    auto       targetData = pixelData + sc<uint64_t>(offsetY) * sc<uint64_t>(shm.stride) + XOFFSET;
    int        glFormat   = PFORMAT->glFormat;

    if (PFORMAT->swizzle.has_value()) {
        if (PFORMAT->swizzle == SWIZZLE_RGBA)
            glFormat = GL_RGBA;
        else if (PFORMAT->swizzle == SWIZZLE_BGRA)
            glFormat = GL_BGRA_EXT;
        else {
            LOGM(Log::ERR, "Copied frame via shm might be broken or color flipped");
            glFormat = GL_RGBA;
        }
    } else if (glFormat == GL_RGBA)
        glFormat = GL_BGRA_EXT;

    // This could be optimized by using a pixel buffer object to make this async,
    // but really clients should just use a dma buffer anyways.
    if (offsetX == 0 && offsetY == 0 && PACKSTRIDE == shm.stride) {
        glReadPixels(offsetX, offsetY, READWIDTH, READHEIGHT, glFormat, PFORMAT->glType, pixelData);
    } else {
        for (size_t i = 0; i < READHEIGHT; ++i) {
            uint32_t y = i;
            glReadPixels(offsetX, offsetY + y, READWIDTH, 1, glFormat, PFORMAT->glType, targetData + i * shm.stride);
        }
    }

    unbind();
    glPixelStorei(GL_PACK_ALIGNMENT, 4);

    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
    return true;
}

CGLFramebuffer::~CGLFramebuffer() {
    release();
}

GLuint CGLFramebuffer::getFBID() {
    return m_fbAllocated ? m_fb : 0;
}

void CGLFramebuffer::invalidate(const std::vector<GLenum>& attachments) {
    if (!isAllocated())
        return;

    glInvalidateFramebuffer(GL_FRAMEBUFFER, attachments.size(), attachments.data());
}
