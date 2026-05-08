import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var workstations: []

    color: root.colors.surface2
    border.color: root.colors.line
    border.width: 1

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 4
        spacing: 4

        Repeater {
            model: root.workstations.length

            Rectangle {
                id: stationButton

                required property int index
                readonly property var station: root.workstations[index] || ({})
                readonly property string label: station.short || station.label || String(index + 1)

                Layout.fillWidth: true
                Layout.preferredHeight: 39
                color: station.active ? root.colors.accent : root.colors.surface
                border.color: station.active ? root.colors.ink : root.colors.line
                border.width: 1

                Column {
                    anchors.centerIn: parent
                    width: parent.width - 6
                    spacing: 0

                    Text {
                        width: parent.width
                        color: stationButton.station.active ? root.colors.paper : root.colors.ink
                        font.bold: true
                        font.family: "monospace"
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        elide: Text.ElideRight
                        text: stationButton.label
                    }

                    Text {
                        width: parent.width
                        color: stationButton.station.active ? root.colors.paper : root.colors.muted
                        font.family: "monospace"
                        font.pixelSize: 7
                        horizontalAlignment: Text.AlignHCenter
                        elide: Text.ElideRight
                        text: stationButton.station.range || stationButton.station.workspace || ""
                    }
                }
            }
        }

        Item {
            Layout.fillHeight: true
        }
    }
}
