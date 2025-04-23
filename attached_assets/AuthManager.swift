// AuthManager.swift :contentReference[oaicite:0]{index=0}&#8203;:contentReference[oaicite:1]{index=1}
import Foundation
import Combine

// Auth Manager for handling authentication state
class AuthManager: ObservableObject {
    static let shared = AuthManager()

    // Published properties
    @Published var currentUser: User?
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var error: String?

    // Store subscriptions
    private var cancellables = Set<AnyCancellable>()

    private init() {
        // Check for existing session on launch
        print("🔄 AuthManager init – checking auth status")
        checkAuthStatus()
    }

    // MARK: - Auth Status

    func checkAuthStatus() {
        isLoading = true
        print("🔍 Checking auth status")
        getCurrentUser()
    }

    private func getCurrentUser() {
        AuthAPI.shared.getCurrentUser()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completionStatus in
                guard let self = self else { return }
                self.isLoading = false

                switch completionStatus {
                case .finished:
                    break
                case .failure(let err):
                    if case .unauthorized = err {
                        // Normal if not logged in
                        self.isAuthenticated = false
                        self.currentUser = nil
                        print("ℹ️ Not logged in (expected)")
                    } else {
                        self.error = err.localizedDescription
                        print("❌ Auth check error:", err.localizedDescription)
                    }
                }
            } receiveValue: { [weak self] response in
                guard let self = self else { return }
                self.currentUser = response.toUser()
                self.isAuthenticated = true
                print("✅ Authenticated as:", response.user.username)
            }
            .store(in: &cancellables)
    }

    // MARK: - Login

    func login(username: String, password: String, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        print("🔑 Logging in:", username)
        performLogin(username: username, password: password, completion: completion)
    }

    private func performLogin(username: String, password: String, completion: @escaping (Bool) -> Void) {
        AuthAPI.shared.login(username: username, password: password)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completionStatus in
                guard let self = self else { return }
                self.isLoading = false

                switch completionStatus {
                case .finished:
                    break
                case .failure(let err):
                    self.error = err.localizedDescription
                    self.isAuthenticated = false
                    self.currentUser = nil
                    print("❌ Login error:", err.localizedDescription)
                    DispatchQueue.main.async { completion(false) }
                }
            } receiveValue: { [weak self] response in
                guard let self = self else { return }
                let basic = response.toUser()

                UserAPI.shared.getUserProfile(userId: basic.id)
                  .receive(on: DispatchQueue.main)
                  .sink(
                    receiveCompletion: { _ in },
                    receiveValue: { prof in
                      // Reconstruct a new User using prof for phoneNumber/etc.
                      let full = User(
                        id: basic.id,
                        username: basic.username,
                        displayName: prof.user.displayName,  // from full profile
                        email: basic.email,
                        phoneNumber: prof.user.phoneNumber,
                        bio: prof.user.bio,
                        photo: prof.user.photo,
                        followerCount: basic.followerCount,
                        followingCount: basic.followingCount,
                        isPrivate: prof.user.isPrivate,
                        emailVerified: basic.emailVerified,
                        role: basic.role,
                        isFollowing: basic.isFollowing,
                        isPending: basic.isPending
                      )

                      self.currentUser = full
                      self.isAuthenticated = true
                      print("✅ Login + profile fetch successful:", full.username)
                      DispatchQueue.main.async { completion(true) }
                    }
                  )
                  .store(in: &cancellables)
                self.isAuthenticated = true
                print("✅ Login successful for:", response.user.username)
                // Debug cookies
                if let baseURL = URL(string: "https://dunbarsocial.app/api") {
                    let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) ?? []
                    print("🍪 Cookies after login:", cookies.count)
                }
                DispatchQueue.main.async { completion(true) }
            }
            .store(in: &cancellables)
    }

    // MARK: - Registration

    func register(
        username: String,
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
        phoneNumber: String,
        bio: String?,
        isPrivate: Bool?,
        profileImage: Data?,
        completion: @escaping (Bool) -> Void
    ) {
        isLoading = true
        error = nil
        print("📝 Registering user:", username)
        performRegistration(
            username: username,
            email: email,
            password: password,
            confirmPassword: confirmPassword,
            name: name,
            phoneNumber: phoneNumber,
            bio: bio,
            isPrivate: isPrivate,
            profileImage: profileImage,
            completion: completion
        )
    }

    private func performRegistration(
        username: String,
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
        phoneNumber: String,
        bio: String?,
        isPrivate: Bool?,
        profileImage: Data?,
        completion: @escaping (Bool) -> Void
    ) {
        AuthAPI.shared.register(
            username: username,
            email: email,
            password: password,
            confirmPassword: confirmPassword,
            name: name,
            phoneNumber: phoneNumber,
            bio: bio,
            isPrivate: isPrivate,
            profileImage: profileImage
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] completionStatus in
            guard let self = self else { return }
            self.isLoading = false

            switch completionStatus {
            case .finished:
                break
            case .failure(let err):
                self.error = err.localizedDescription
                print("❌ Registration error:", err.localizedDescription)
                DispatchQueue.main.async { completion(false) }
            }
        } receiveValue: { [weak self] response in
            guard let self = self else { return }
            self.currentUser = response.toUser()
            self.isAuthenticated = true
            print("✅ Registration successful for:", response.user.username)

            // ── new: default showPhoneNumber = true ──
            print("🔄 Defaulting showPhoneNumber → true")
            UserAPI.shared
                .updatePrivacySettings(settings: ["showPhoneNumber": true])
                .receive(on: DispatchQueue.main)
                .sink { comp in
                    if case let .failure(err) = comp {
                        print("❌ Failed default showPhoneNumber:", err.localizedDescription)
                    }
                } receiveValue: { newSettings in
                    print("✅ showPhoneNumber is now:", newSettings.showPhoneNumber)
                }
                .store(in: &self.cancellables)

            DispatchQueue.main.async { completion(true) }
        }
        .store(in: &cancellables)
    }

    // MARK: - Logout

    func logout(completion: @escaping (Bool) -> Void) {
        isLoading = true
        print("🚪 Logging out")
        AuthAPI.shared.logout()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completionStatus in
                guard let self = self else { return }
                self.isLoading = false

                switch completionStatus {
                case .finished:
                    self.clearUserSession()
                    print("✅ Logout successful")
                    DispatchQueue.main.async { completion(true) }
                case .failure(let err):
                    print("⚠️ Logout error (clearing anyway):", err.localizedDescription)
                    self.clearUserSession()
                    DispatchQueue.main.async { completion(true) }
                }
            } receiveValue: { _ in }
            .store(in: &cancellables)
    }

    // MARK: - Helpers

    func updateCurrentUser(_ user: User) {
        print("🔄 Updating current user in AuthManager: \(user.username)")
        print("📱 Phone number in update: \(user.phoneNumber ?? "nil")")
        
        // Set the current user to the new user
        self.currentUser = user
    }
    private func clearUserSession() {
        print("🔄 Clearing session & cookies")
        currentUser = nil
        isAuthenticated = false
        if let cookies = HTTPCookieStorage.shared.cookies {
            print("🍪 Deleting \(cookies.count) cookies")
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }
    }
}
