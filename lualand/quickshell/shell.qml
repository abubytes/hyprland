//@ pragma ShellId lualand
//@ pragma AppId land.lualand.shell
//@ pragma Env QS_NO_RELOAD_POPUP=1
//@ pragma Env QT_QUICK_CONTROLS_STYLE=Basic
//@ pragma Env QT_QUICK_FLICKABLE_WHEEL_DECELERATION=10000

import "./components" as Lualand
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    id: root

    readonly property int panelWidth: 386
    readonly property int panelHeight: 760
    readonly property var colors: ({
        "paper": "#101318",
        "surface": "#171c22",
        "surface2": "#0b0e12",
        "ink": "#eef3f8",
        "muted": "#9aa5b1",
        "line": "#2e3742",
        "accent": "#7dd3fc",
        "good": "#a6e3a1",
        "warn": "#f9e2af",
        "bad": "#f38ba8"
    })
    readonly property string statePath: {
        const envPath = Quickshell.env("LUALAND_QS_STATE");
        return envPath && envPath !== "" ? envPath : Quickshell.shellPath("state.sample.json");
    }
    readonly property string targetScreen: {
        const envScreen = Quickshell.env("LUALAND_QS_SCREEN");
        return envScreen && envScreen !== "" ? envScreen : "HDMI-A-1~2";
    }
    property var shellState: fallbackState()

    function panelScreens() {
        const screens = Quickshell.screens;
        if (!screens || screens.length === 0)
            return [];

        if (targetScreen === "all")
            return screens;

        const exact = screens.filter(screen => screen.name === targetScreen);
        if (exact.length > 0)
            return exact;

        const rightSplit = screens.filter(screen => String(screen.name).endsWith("~2"));
        if (rightSplit.length > 0)
            return rightSplit;

        return [screens[screens.length - 1]];
    }

    function fallbackState() {
        return {
            "dayLabel": "Lualand",
            "summary": "Local sample state",
            "activeBlock": {
                "name": "Focus block",
                "time": "19:00-20:30",
                "workstation": "Code",
                "status": "active"
            },
            "workstations": [{
                "id": "code",
                "label": "Code",
                "short": "C",
                "iconName": "work",
                "active": true,
                "workspace": "11-20"
            }, {
                "id": "docs",
                "label": "Docs",
                "short": "D",
                "iconName": "docs",
                "active": false,
                "workspace": "21-30"
            }],
            "timeline": [{
                "time": "19:00",
                "title": "Focus block",
                "detail": "Local fallback timeline",
                "workstation": "Code",
                "status": "active"
            }],
            "tasks": []
        };
    }

    function normalizeState(raw) {
        const fallback = fallbackState();
        if (!raw || typeof raw !== "object")
            return fallback;

        return {
            "dayLabel": String(raw.dayLabel || fallback.dayLabel),
            "summary": String(raw.summary || fallback.summary),
            "activeBlock": raw.activeBlock || fallback.activeBlock,
            "workstations": Array.isArray(raw.workstations) && raw.workstations.length > 0 ? raw.workstations : fallback.workstations,
            "timeline": Array.isArray(raw.timeline) && raw.timeline.length > 0 ? raw.timeline : fallback.timeline,
            "tasks": Array.isArray(raw.tasks) ? raw.tasks : []
        };
    }

    function reloadState() {
        try {
            const text = stateFile.text();
            if (!text || text.trim() === "") {
                shellState = fallbackState();
                return ;
            }
            shellState = normalizeState(JSON.parse(text));
        } catch (error) {
            console.warn("lualand: failed to load state from", statePath, error);
            shellState = fallbackState();
        }
    }

    Component.onCompleted: reloadState()

    FileView {
        id: stateFile

        path: root.statePath
        preload: true
        blockLoading: true
        watchChanges: true
        onLoaded: root.reloadState()
        onLoadFailed: root.shellState = root.fallbackState()
        onFileChanged: {
            reload();
            root.reloadState();
        }
    }

    Variants {
        model: root.panelScreens()

        PanelWindow {
            id: panel

            required property var modelData

            screen: modelData
            implicitWidth: root.panelWidth
            implicitHeight: root.panelHeight
            color: "transparent"
            aboveWindows: true
            focusable: false
            exclusionMode: ExclusionMode.Auto
            WlrLayershell.namespace: "lualand:top-panel:" + (modelData ? modelData.name : "screen")
            WlrLayershell.layer: WlrLayer.Top

            anchors {
                top: true
                left: true
                right: true
            }

            Lualand.RightPanel {
                anchors {
                    fill: parent
                }
                colors: root.colors
                shellState: root.shellState
                screenLabel: panel.modelData ? panel.modelData.name : "screen"
            }

        }

    }

}
