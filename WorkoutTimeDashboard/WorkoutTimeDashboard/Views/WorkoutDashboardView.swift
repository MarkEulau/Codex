import SwiftUI
import Charts

struct WorkoutDashboardView: View {
    @StateObject private var viewModel: WorkoutDashboardViewModel

    init(viewModel: WorkoutDashboardViewModel = WorkoutDashboardViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.state {
                case .loading:
                    LoadingStateView()

                case .noPermission:
                    EmptyStateView(
                        title: "Health Access Needed",
                        message: "Please allow workout access in Health settings to build your dashboard.",
                        buttonTitle: "Grant Access"
                    ) {
                        Task { await viewModel.retryAuthorization() }
                    }

                case .noData:
                    EmptyStateView(
                        title: "No Workouts Found",
                        message: "No workouts match your selected date filter.",
                        buttonTitle: nil,
                        action: nil
                    )

                case .error(let message):
                    EmptyStateView(
                        title: "Something Went Wrong",
                        message: message,
                        buttonTitle: "Try Again"
                    ) {
                        Task { await viewModel.filterChanged() }
                    }

                case .loaded:
                    dashboardContent
                }
            }
            .navigationTitle("Workout Time Dashboard")
            .task { await viewModel.onAppear() }
        }
    }

    private var dashboardContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                controlsSection
                chartSection
                listSection
            }
            .padding()
        }
        .refreshable {
            await viewModel.filterChanged()
        }
    }

    private var controlsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Date Range", selection: $viewModel.selectedFilter) {
                ForEach(DateFilter.allCases) { filter in
                    Text(filter.rawValue).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: viewModel.selectedFilter) { _ in
                Task { await viewModel.filterChanged() }
            }

            Picker("Chart Unit", selection: $viewModel.chartUnit) {
                ForEach(ChartUnit.allCases) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Total Time by Workout Type")
                .font(.headline)

            Chart(viewModel.summaries) { summary in
                BarMark(
                    x: .value("Workout Type", summary.friendlyName),
                    y: .value(viewModel.chartUnit.axisLabel, viewModel.chartUnit.value(for: summary))
                )
                .foregroundStyle(by: .value("Workout Type", summary.friendlyName))
            }
            .frame(height: 300)
            .chartLegend(.hidden)
            .chartXAxis {
                AxisMarks(values: .automatic) { value in
                    AxisGridLine()
                    AxisTick()
                    AxisValueLabel {
                        if let label = value.as(String.self) {
                            Text(label)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var listSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Detailed Breakdown")
                .font(.headline)

            ForEach(viewModel.summaries) { summary in
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(summary.friendlyName)
                            .font(.subheadline.weight(.semibold))
                        Text("\(summary.workoutCount) workout\(summary.workoutCount == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(summary.formattedDuration)
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.primary)
                }
                .padding(.vertical, 6)

                if summary.id != viewModel.summaries.last?.id {
                    Divider()
                }
            }
        }
        .padding()
        .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

#Preview {
    WorkoutDashboardView(viewModel: .preview)
}
