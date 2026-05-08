import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var bar: ({})

    color: root.colors.paper
    border.color: root.colors.line
    border.width: 1

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 10

        Text {
            color: root.colors.ink
            font.bold: true
            font.family: "monospace"
            font.pixelSize: 13
            text: root.bar.time || "--:--"
        }

        Text {
            Layout.preferredWidth: 70
            color: root.colors.muted
            font.family: "monospace"
            font.pixelSize: 10
            elide: Text.ElideRight
            text: root.bar.date || ""
        }

        Rectangle {
            Layout.preferredWidth: 1
            Layout.fillHeight: true
            Layout.topMargin: 7
            Layout.bottomMargin: 7
            color: root.colors.line
        }

        Text {
            Layout.preferredWidth: 74
            color: root.colors.good
            font.bold: true
            font.family: "monospace"
            font.pixelSize: 11
            elide: Text.ElideRight
            text: "ws " + (root.bar.workspace || "--")
        }

        Text {
            Layout.preferredWidth: 112
            color: root.colors.ink
            font.family: "monospace"
            font.pixelSize: 11
            elide: Text.ElideRight
            text: root.bar.workstation || "any"
        }

        Text {
            Layout.fillWidth: true
            color: root.colors.muted
            font.family: "monospace"
            font.pixelSize: 11
            elide: Text.ElideRight
            text: root.bar.block || "No block"
        }
    }
}
