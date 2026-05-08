import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var workstations: []

    function localIconSource(station) {
        const raw = String(station.iconName || station.icon || station.id || "work");
        if (raw.indexOf("/") >= 0)
            return raw;
        if (raw.endsWith(".png"))
            return Qt.resolvedUrl("../assets/icons/" + raw);
        return Qt.resolvedUrl("../assets/icons/" + raw + ".png");
    }

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
                Layout.preferredHeight: 38
                color: station.active ? root.colors.accent : root.colors.surface
                border.color: station.active ? root.colors.ink : root.colors.line
                border.width: 1

                Image {
                    id: icon

                    anchors.centerIn: parent
                    width: 24
                    height: 24
                    source: root.localIconSource(stationButton.station)
                    sourceSize.width: 48
                    sourceSize.height: 48
                    fillMode: Image.PreserveAspectFit
                    smooth: true
                    visible: status === Image.Ready
                }

                Text {
                    anchors.centerIn: parent
                    visible: icon.status !== Image.Ready
                    color: stationButton.station.active ? root.colors.paper : root.colors.ink
                    font.bold: true
                    font.family: "monospace"
                    font.pixelSize: 12
                    text: stationButton.label
                }
            }
        }

        Item {
            Layout.fillHeight: true
        }
    }
}
