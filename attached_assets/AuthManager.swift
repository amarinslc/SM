// AuthManager.swift
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
        checkAuthStatus()
    }
    
    // Check if user is already authenticated with improved reliability
    func checkAuthStatus() {
        isLoading = true
        
        // First make sure the server is awake
        APIService.shared.wakeUpServerEnhanced(maxRetries: 3)
            .receive(on: DispatchQueue.main)
            .sink { serverReady in
                if !serverReady {
                    self.isLoading = false
                    self.error = "Unable to connect to server. Please try again later."
                    self.isAuthenticated = false
                    return
                }
                
                // Then check authentication status
                self.getCurrentUser()
            }
            .store(in: &cancellables)
    }
    
    // Separate method to get current user for better reusability
    private func getCurrentUser() {
        AuthAPI.shared.getCurrentUser()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completionStatus in
                guard let self = self else { return }
                self.isLoading = false
                
                switch completionStatus {
                case .finished:
                    break
                case .failure(let error):
                    if case .unauthorized = error {
                        // This is expected if not logged in - just set authenticated to false
                        self.isAuthenticated = false
                        self.currentUser = nil
                        print("Not logged in yet (this is normal)")
                    } else {
                        // Other errors should still be reported
                        self.error = error.localizedDescription
                        print("Auth check error: \(error.localizedDescription)")
                    }
                }
            } receiveValue: { [weak self] response in
                guard let self = self else { return }
                // Convert from AuthResponse to User
                self.currentUser = response.toUser()
                self.isAuthenticated = true
                print("User already logged in: \(response.user.username)")
                
                // Print authentication details for debugging
                print("👤 User details - isFollowing: \(response.isFollowing), isPending: \(response.isPending)")
            }
            .store(in: &cancellables)
    }
    
    // Login with improved error handling and server connection check
    func login(username: String, password: String, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        // First make sure the server is awake before attempting login
        APIService.shared.wakeUpServerEnhanced(maxRetries: 3)
            .receive(on: DispatchQueue.main)
            .sink { serverReady in
                if !serverReady {
                    self.isLoading = false
                    self.error = "Unable to connect to server. Please try again later."
                    DispatchQueue.main.async {
                        completion(false)
                    }
                    return
                }
                
                // Proceed with login
                self.performLogin(username: username, password: password, completion: completion)
            }
            .store(in: &cancellables)
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
                case .failure(let error):
                    self.error = error.localizedDescription
                    self.isAuthenticated = false
                    self.currentUser = nil
                    
                    print("❌ Login error: \(error.localizedDescription)")
                    
                    DispatchQueue.main.async {
                        completion(false)
                    }
                }
            } receiveValue: { [weak self] response in
                guard let self = self else { return }
                // Convert from AuthResponse to User
                self.currentUser = response.toUser()
                self.isAuthenticated = true
                
                print("✅ Login successful for user: \(response.user.username)")
                print("👤 User relationship - isFollowing: \(response.isFollowing), isPending: \(response.isPending)")
                
                // Verify that cookies were properly stored
                if let baseURL = URL(string: "https://dbsocial.replit.app") {
                    let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) ?? []
                    if !cookies.isEmpty {
                        print("🍪 Cookies stored after login: \(cookies.count)")
                    } else {
                        print("⚠️ No cookies found after login! This may cause session issues.")
                    }
                }
                
                DispatchQueue.main.async {
                    completion(true)
                }
            }
            .store(in: &cancellables)
    }
    
    // Register with improved error handling and server connection check
    func register(
        username: String,
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
        bio: String?,
        isPrivate: Bool?,
        profileImage: Data?,
        completion: @escaping (Bool) -> Void
    ) {
        isLoading = true
        error = nil
        
        // First make sure the server is awake before attempting registration
        APIService.shared.wakeUpServerEnhanced(maxRetries: 3)
            .receive(on: DispatchQueue.main)
            .sink { serverReady in
                if !serverReady {
                    self.isLoading = false
                    self.error = "Unable to connect to server. Please try again later."
                    DispatchQueue.main.async {
                        completion(false)
                    }
                    return
                }
                
                // Proceed with registration
                self.performRegistration(
                    username: username,
                    email: email,
                    password: password,
                    confirmPassword: confirmPassword,
                    name: name,
                    bio: bio,
                    isPrivate: isPrivate,
                    profileImage: profileImage,
                    completion: completion
                )
            }
            .store(in: &cancellables)
    }
    
    private func performRegistration(
        username: String,
        email: String,
        password: String,
        confirmPassword: String,
        name: String,
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
            case .failure(let error):
                self.error = error.localizedDescription
                print("❌ Registration error: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    completion(false)
                }
            }
        } receiveValue: { [weak self] response in
            guard let self = self else { return }
            // Convert from AuthResponse to User
            self.currentUser = response.toUser()
            self.isAuthenticated = true
            
            print("✅ Registration successful for user: \(response.user.username)")
            print("👤 User relationship - isFollowing: \(response.isFollowing), isPending: \(response.isPending)")
            
            DispatchQueue.main.async {
                completion(true)
            }
        }
        .store(in: &cancellables)
    }
    
    // Logout with improved error handling
    func logout(completion: @escaping (Bool) -> Void) {
        isLoading = true
        
        AuthAPI.shared.logout()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completionStatus in
                guard let self = self else { return }
                self.isLoading = false
                
                switch completionStatus {
                case .finished:
                    self.clearUserSession()
                    print("✅ Logout successful")
                    DispatchQueue.main.async {
                        completion(true)
                    }
                case .failure(let error):
                    print("⚠️ Logout had server error: \(error.localizedDescription) - still clearing local session")
                    // Even if the server logout fails, we'll clear local state
                    self.clearUserSession()
                    DispatchQueue.main.async {
                        completion(true)
                    }
                }
            } receiveValue: { _ in
                // We don't need to capture self here since we're not using it
                // The value is ignored as we handle everything in completion
            }
            .store(in: &cancellables)
    }
    
    // Update current user
    func updateCurrentUser(_ user: User) {
        self.currentUser = user
    }
    
    // Clear user session
    private func clearUserSession() {
        self.currentUser = nil
        self.isAuthenticated = false
        
        // Clear cookies for complete logout
        if let cookies = HTTPCookieStorage.shared.cookies {
            print("🍪 Clearing \(cookies.count) cookies from session")
            for cookie in cookies {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }
}
