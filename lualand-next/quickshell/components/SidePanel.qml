import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    required property var colors
    required property var shellState
    property string screenLabel: "screen"
    property string statePath: ""
    property string actionScript: ""
    readonly property var state: shellState || ({})
    readonly property var activeBlock: state.activeBlock || ({})
    readonly property var timer: state.timer || ({})
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

            BlockSummary {
                Layout.fillWidth: true
                Layout.preferredHeight: 76
                colors: root.colors
                block: root.activeBlock
                timer: root.timer
                actionScript: root.actionScript
            }

            TaskList {
                Layout.fillWidth: true
                Layout.preferredHeight: 142
                colors: root.colors
                tasks: root.tasks
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 22
                color: root.colors.surface2
                border.color: root.colors.line
                border.width: 1

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 7
                    anchors.rightMargin: 7
                    spacing: 8

                    Text {
                        Layout.fillWidth: true
                        color: root.colors.ink
                        font.bold: true
                        font.family: "monospace"
                        font.pixelSize: 10
                        text: "timeline"
                    }

                    Text {
                        color: root.colors.accent
                        font.family: "monospace"
                        font.pixelSize: 10
                        text: root.timeline.length + " rows"
                    }
                }
            }

            Flickable {
                id: timelineFlick

                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.minimumHeight: 180
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                contentWidth: width
                contentHeight: timelineColumn.implicitHeight

                Column {
                    id: timelineColumn

                    width: Math.max(1, timelineFlick.width - 10)
                    spacing: 2

                    Repeater {
                        model: root.timeline

                        TimelineRow {
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

            Text {
                Layout.fillWidth: true
                color: root.colors.muted
                font.family: "monospace"
                font.pixelSize: 9
                elide: Text.ElideMiddle
                text: root.screenLabel + " / " + root.statePath
            }
        }

        WorkstationRail {
            Layout.preferredWidth: 48
            Layout.fillHeight: true
            colors: root.colors
            workstations: root.workstations
        }
    }
}
