import QtQuick
import QtQuick.Layouts
import Quickshell

Rectangle {
    id: root

    required property var colors
    property var block: ({})
    property var timer: ({})
    property string actionScript: ""
    readonly property string actionName: String((root.timer && root.timer.primaryAction) || root.block.primaryAction || "")
    readonly property string actionLabel: String((root.timer && root.timer.primaryLabel) || root.block.primaryLabel || "")
    readonly property bool actionEnabled: root.actionScript !== "" && root.actionName !== "" && root.actionName !== "none"

    function runAction() {
        if (root.actionEnabled)
            Quickshell.execDetached([root.actionScript, root.actionName]);
    }

    color: root.colors.surface2
    border.color: "transparent"
    border.width: 0

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 4
            Layout.rightMargin: 4
            spacing: 6

            Text {
                Layout.fillWidth: true
                color: root.colors.ink
                font.bold: true
                font.pixelSize: 12
                elide: Text.ElideRight
                text: root.block.name || "idle"
            }

            Rectangle {
                id: actionButton

                Layout.preferredWidth: visible ? Math.max(58, actionText.implicitWidth + 16) : 0
                Layout.preferredHeight: 20
                visible: root.actionLabel !== ""
                color: actionMouse.pressed ? root.colors.accent : (actionMouse.containsMouse ? root.colors.surface : root.colors.paper)
                border.color: root.actionEnabled ? root.colors.accent : root.colors.line
                border.width: 1

                Text {
                    id: actionText

                    anchors.centerIn: parent
                    color: actionMouse.pressed ? root.colors.paper : (root.actionEnabled ? root.colors.accent : root.colors.muted)
                    font.bold: true
                    font.family: "monospace"
                    font.pixelSize: 9
                    text: root.actionLabel
                }

                MouseArea {
                    id: actionMouse

                    anchors.fill: parent
                    enabled: root.actionEnabled
                    hoverEnabled: true
                    cursorShape: root.actionEnabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: root.runAction()
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 4
            Layout.rightMargin: 4
            spacing: 5

            Text {
                Layout.fillWidth: true
                color: root.colors.muted
                font.family: "monospace"
                font.pixelSize: 10
                elide: Text.ElideRight
                text: (root.block.time || "--:--") + " / " + (root.block.workstation || "any")
            }

            Text {
                color: root.colors.accent
                font.bold: true
                font.family: "monospace"
                font.pixelSize: 11
                text: root.block.remainingText || "--m"
            }
        }
    }
}
