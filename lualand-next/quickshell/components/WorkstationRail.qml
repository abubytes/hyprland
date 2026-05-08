import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Widgets

Rectangle {
    id: root

    required property var colors
    property var workstations: []

    color: root.colors.surface2
    border.color: "transparent"
    border.width: 0

    Flickable {
        id: railFlick

        anchors.fill: parent
        anchors.margins: 0
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        contentWidth: width
        contentHeight: railColumn.implicitHeight
        readonly property real scrollRange: Math.max(0, contentHeight - height)
        readonly property real scrollProgress: scrollRange <= 0
            ? 0
            : Math.max(0, Math.min(1, contentY / scrollRange))

        ColumnLayout {
            id: railColumn

            width: Math.max(1, railFlick.width - 1)
            spacing: 0

            Repeater {
                model: root.workstations.length

                Rectangle {
                    id: stationButton

                    required property int index
                    readonly property var station: root.workstations[index] || ({})
                    readonly property string label: station.label || station.short || String(index + 1)

                    Layout.fillWidth: true
                    Layout.preferredHeight: 38
                    color: station.active ? root.colors.accent : (index % 2 === 0 ? root.colors.surface2 : root.colors.surface)
                    border.color: "transparent"
                    border.width: 0

                    Column {
                        anchors.centerIn: parent
                        width: parent.width - 2
                        spacing: 0

                        IconImage {
                            anchors.horizontalCenter: parent.horizontalCenter
                            implicitSize: 15
                            source: Quickshell.iconPath(stationButton.station.iconName || "folder", "image-missing")
                        }

                        Text {
                            width: parent.width
                            color: stationButton.station.active ? root.colors.paper : root.colors.ink
                            font.bold: stationButton.station.active
                            font.pixelSize: 7
                            horizontalAlignment: Text.AlignHCenter
                            elide: Text.ElideRight
                            maximumLineCount: 1
                            text: stationButton.label
                        }
                    }
                }
            }
        }

        Rectangle {
            anchors.top: parent.top
            anchors.right: parent.right
            width: 1
            height: railFlick.scrollRange <= 0 ? 0 : Math.max(2, railFlick.height * railFlick.scrollProgress)
            color: root.colors.accent
            visible: railFlick.scrollRange > 0
        }
    }
}
