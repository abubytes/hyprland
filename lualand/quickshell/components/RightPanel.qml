import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    required property var colors
    required property var shellState
    property string screenLabel: "screen"
    readonly property var state: shellState || ({})
    readonly property var activeBlock: state.activeBlock || ({})
    readonly property var workstations: Array.isArray(state.workstations) ? state.workstations : []
    readonly property var timeline: Array.isArray(state.timeline) ? state.timeline : []
    readonly property var tasks: Array.isArray(state.tasks) ? state.tasks : []

    Rectangle {
        anchors.fill: parent
        color: root.colors.paper
        border.color: root.colors.line
        border.width: 1
    }

    RowLayout {
        anchors.fill: parent
        anchors.margins: 6
        spacing: 5

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 5

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 44
                color: root.colors.surface
                border.color: root.colors.line
                border.width: 1

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    anchors.rightMargin: 8
                    spacing: 8

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0

                        Text {
                            Layout.fillWidth: true
                            color: root.colors.ink
                            font.bold: true
                            font.pixelSize: 13
                            elide: Text.ElideRight
                            text: root.activeBlock.name || "idle"
                        }

                        Text {
                            Layout.fillWidth: true
                            color: root.colors.muted
                            font.pixelSize: 10
                            elide: Text.ElideRight
                            text: (root.activeBlock.time || "--:--") + " / " + (root.activeBlock.workstation || "any")
                        }
                    }

                    Rectangle {
                        Layout.preferredWidth: Math.max(54, timerText.implicitWidth + 12)
                        Layout.preferredHeight: 25
                        color: root.colors.surface2
                        border.color: root.colors.accent
                        border.width: 1

                        Text {
                            id: timerText

                            anchors.centerIn: parent
                            color: root.colors.accent
                            font.bold: true
                            font.family: "monospace"
                            font.pixelSize: 12
                            text: root.activeBlock.remainingText || root.activeBlock.overrunText || "--m"
                        }
                    }
                }
            }

            TaskList {
                Layout.fillWidth: true
                Layout.preferredHeight: 136
                colors: root.colors
                tasks: root.tasks
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 20
                color: root.colors.surface2
                border.color: root.colors.line
                border.width: 1

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 6
                    spacing: 6

                    Text {
                        Layout.fillWidth: true
                        color: root.colors.muted
                        font.bold: true
                        font.family: "monospace"
                        font.pixelSize: 10
                        text: "timeline"
                    }

                    Text {
                        color: root.colors.accent
                        font.family: "monospace"
                        font.pixelSize: 10
                        text: root.timeline.length + " blocks"
                    }
                }
            }

            Flickable {
                id: timelineFlick

                Layout.fillWidth: true
                Layout.preferredHeight: 126
                Layout.maximumHeight: 126
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                contentWidth: width
                contentHeight: timelineColumn.implicitHeight

                Column {
                    id: timelineColumn

                    width: Math.max(1, timelineFlick.width - 10)
                    spacing: 1

                    Repeater {
                        model: root.timeline

                        TimelineCard {
                            required property var modelData

                            width: timelineColumn.width
                            colors: root.colors
                            entry: modelData || ({})
                        }
                    }
                }

                ScrollBar.vertical: ScrollBar {
                    policy: ScrollBar.AlwaysOn
                }
            }

            Item {
                Layout.fillHeight: true
            }
        }

        WorkstationRail {
            Layout.preferredWidth: 46
            Layout.fillHeight: true
            colors: root.colors
            workstations: root.workstations
        }
    }
}
