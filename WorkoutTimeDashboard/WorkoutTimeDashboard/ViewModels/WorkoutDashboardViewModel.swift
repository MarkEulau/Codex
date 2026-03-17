import Foundation

@MainActor
final class WorkoutDashboardViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case noPermission
        case noData
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var summaries: [WorkoutSummary] = []
    @Published var selectedFilter: DateFilter = .thirtyDays
    @Published var chartUnit: ChartUnit = .hours

    private let healthKitManager: HealthKitManaging

    init(healthKitManager: HealthKitManaging = HealthKitManager()) {
        self.healthKitManager = healthKitManager
    }

    func onAppear() async {
        await refresh(shouldRequestPermission: true)
    }

    func filterChanged() async {
        await refresh(shouldRequestPermission: false)
    }

    func retryAuthorization() async {
        await refresh(shouldRequestPermission: true)
    }

    private func refresh(shouldRequestPermission: Bool) async {
        state = .loading

        guard healthKitManager.isHealthDataAvailable else {
            state = .error("Health data is not available on this device.")
            return
        }

        do {
            if shouldRequestPermission {
                let authorized = try await healthKitManager.requestAuthorization()
                guard authorized else {
                    state = .noPermission
                    return
                }
            }

            let data = try await healthKitManager.fetchWorkoutSummaries(startDate: selectedFilter.startDate)
            summaries = data
            state = data.isEmpty ? .noData : .loaded
        } catch {
            if String(describing: error).localizedCaseInsensitiveContains("authorization") {
                state = .noPermission
            } else {
                state = .error(error.localizedDescription)
            }
        }
    }
}
