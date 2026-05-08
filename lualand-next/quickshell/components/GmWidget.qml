import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var gm: ({})
    property string dayLabel: ""
    property string updatedAt: ""

    color: root.colors.surface
    border.color: root.colors.line
    border.width: 1

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 2

        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                color: root.colors.accent
                font.bold: true
                font.family: "monospace"
                font.pixelSize: 18
                text: root.gm.title || "GM"
            }

            Text {
                Layout.fillWidth: true
                color: root.colors.ink
                font.bold: true
                font.pixelSize: 12
                elide: Text.ElideRight
                text: root.dayLabel
            }

            Text {
                color: root.colors.good
                font.family: "monospace"
                font.pixelSize: 10
                text: root.gm.status || "state"
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 1
            color: root.colors.line
        }

        Text {
            Layout.fillWidth: true
            color: root.colors.ink
            font.family: "monospace"
            font.pixelSize: 11
            elide: Text.ElideRight
            text: root.gm.line1 || "passive laptop widget"
        }

        Text {
            Layout.fillWidth: true
            color: root.colors.muted
            font.family: "monospace"
            font.pixelSize: 10
            elide: Text.ElideRight
            text: (root.gm.line2 || "exported JSON only") + " / " + root.updatedAt
        }
    }
}
