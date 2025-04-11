import Foundation
import Combine
import SwiftUI

class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var posts: [Post] = []
    @Published var followRequests: [FollowRequest] = []
    @Published var outgoingRequests: [FollowRequest] = []
    @Published var followers: [SimpleUser] = []
    @Published var following: [SimpleUser] = []
    @Published var isLoading = false
    @Published var isLoadingFollowers = false
    @Published var isLoadingFollowing = false
    @Published var error: String?
    
    // Make cancellables internal instead of private to allow access
    var cancellables = Set<AnyCancellable>()
    
    // MARK: - Profile Fetching
    
    // In fetchUserProfile method
    func fetchUserProfile(userId: Int) {
        isLoading = true
        error = nil
        
        // First wake up the server
        APIService.shared.wakeUpServerEnhanced(maxRetries: 3)
            .receive(on: DispatchQueue.main)
            .sink { serverAwake in
                if serverAwake {
                    // Then check authentication status
                    APIService.shared.refreshAuthIfNeeded()
                        .receive(on: DispatchQueue.main)
                        .sink { authValid in
                            if authValid {
                                // Session is valid, fetch profile
                                self.getUserProfile(userId: userId)
                            } else {
                                // Session expired, notify user
                                self.isLoading = false
                                self.error = "Your session has expired. Please log in again."
                                
                                // Trigger logout
                                DispatchQueue.main.async {
                                    AuthManager.shared.isAuthenticated = false
                                    NotificationCenter.default.post(name: NSNotification.Name("SessionExpired"), object: nil)
                                }
                            }
                        }
                        .store(in: &self.cancellables)
                } else {
                    self.isLoading = false
                    self.error = "Unable to connect to server. Please try again later."
                }
            }
            .store(in: &cancellables)
    }
    
    private func getUserProfile(userId: Int) {
        UserAPI.shared.getUserProfile(userId: userId)
            .retry(3) // Add automatic retry for transient failures
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoading = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                    print("❌ Profile fetch error: \(err.localizedDescription)")
                }
            } receiveValue: { response in
                // Log the full response for debugging
                print("✅ Received profile response for user ID \(userId)")
                print("👤 User relationship - isFollowing: \(response.isFollowing), isPending: \(response.isPending)")
                
                // Convert response to User model
                self.user = response.toUser()
                self.fetchFollowerCount(userId: userId)
                self.fetchFollowingCount(userId: userId)
                self.fetchUserPosts(userId: userId)
            }
            .store(in: &cancellables)
    }
    
    
    func fetchFollowerCount(userId: Int) {
        APIService.shared.request(endpoint: "/users/\(userId)/followers", method: .get)
            .receive(on: DispatchQueue.main)
            .sink { _ in } receiveValue: { (followers: [SimpleUser]) in
                if var currentUser = self.user {
                    currentUser.followerCount = followers.count
                    self.user = currentUser
                }
            }
            .store(in: &cancellables)
    }
    
    func fetchFollowingCount(userId: Int) {
        APIService.shared.request(endpoint: "/users/\(userId)/following", method: .get)
            .receive(on: DispatchQueue.main)
            .sink { _ in } receiveValue: { (following: [SimpleUser]) in
                if var currentUser = self.user {
                    currentUser.followingCount = following.count
                    self.user = currentUser
                }
            }
            .store(in: &cancellables)
    }
    
    func fetchUserPosts(userId: Int) {
        guard let user = self.user else { return }
        let currentUserId = AuthManager.shared.currentUser?.id
        let canViewPosts = !user.isPrivate || user.isFollowing || userId == currentUserId
        
        if !canViewPosts {
            self.isLoading = false
            return
        }
        
        UserAPI.shared.getUserPosts(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoading = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                    print("❌ Posts fetch error: \(err.localizedDescription)")
                }
            } receiveValue: { profilePosts in
                self.posts = profilePosts.map { profilePost in
                    profilePost.toPost(profileUser: user)
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Profile Update
    
    func updateProfile(name: String, bio: String?, isPrivate: Bool, profileImage: Data?, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        // Ensure server is awake before updating profile
        APIService.shared.wakeUpServer()
            .flatMap { _ -> AnyPublisher<User, NetworkError> in
                return UserAPI.shared.updateProfile(
                    name: name,
                    bio: bio,
                    isPrivate: isPrivate,
                    profileImage: profileImage
                )
            }
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                switch completionStatus {
                case .finished:
                    break
                case .failure(let err):
                    self.error = err.localizedDescription
                    print("❌ Profile update error: \(err.localizedDescription)")
                    completion(false)
                }
            } receiveValue: { updatedUser in
                self.user = updatedUser
                if let currentUser = AuthManager.shared.currentUser, currentUser.id == updatedUser.id {
                    AuthManager.shared.updateCurrentUser(updatedUser)
                }
                completion(true)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Follow/Unfollow and Follow Requests
    
    func followUser(userId: Int, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        UserAPI.shared.followUser(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                    print("❌ Follow request failed: \(err.localizedDescription)")
                    completion(false)
                }
            } receiveValue: { response in
                print("✅ Follow response: \(response.message ?? "No message")")
                
                // Checking optional Bool with proper nil-coalescing
                if response.success == true || response.message?.contains("Follow request sent") == true {
                    if var currentUser = self.user, currentUser.id == userId {
                        if currentUser.isPrivate {
                            currentUser.isPending = true
                            print("📝 Set user status to pending (private account)")
                        } else {
                            currentUser.isFollowing = true
                            print("📝 Set user status to following (public account)")
                        }
                        self.user = currentUser
                    }
                    
                    // After a successful follow request, refresh the outgoing requests
                    if let currentUserId = AuthManager.shared.currentUser?.id {
                        self.fetchOutgoingRequests()
                    }
                    
                    completion(true)
                } else {
                    print("⚠️ Follow response indicates failure")
                    self.error = response.message ?? "Failed to follow user"
                    completion(false)
                }
            }
            .store(in: &cancellables)
    }
    
    func unfollowUser(userId: Int, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        UserAPI.shared.unfollowUser(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                    completion(false)
                }
            } receiveValue: { response in
                if var currentUser = self.user, currentUser.id == userId {
                    currentUser.isFollowing = false
                    currentUser.isPending = false
                    self.user = currentUser
                }
                // Use nil-coalescing to safely unwrap the optional Bool
                completion(response.success ?? true)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Followers and Following Management
    
    func fetchFollowers(userId: Int) {
        isLoadingFollowers = true
        
        UserAPI.shared.getFollowers(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoadingFollowers = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                }
            } receiveValue: { followers in
                self.followers = followers
            }
            .store(in: &cancellables)
    }
    
    func fetchFollowing(userId: Int) {
        isLoadingFollowing = true
        
        UserAPI.shared.getFollowing(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoadingFollowing = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                }
            } receiveValue: { following in
                self.following = following
            }
            .store(in: &cancellables)
    }
    
    func removeFollower(userId: Int, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        UserAPI.shared.removeFollower(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                    completion(false)
                }
            } receiveValue: { response in
                // Properly unwrap optional Bool with nil-coalescing
                if response.success ?? true {
                    self.followers.removeAll { $0.id == userId }
                    if var currentUser = self.user {
                        currentUser.followerCount -= 1
                        self.user = currentUser
                    }
                }
                completion(response.success ?? true)
            }
            .store(in: &cancellables)
    }
    
    // In ProfileViewModel.swift

    func acceptFollowRequest(requestId: Int, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil
        
        // Find the request to identify the follower
        let requestIndex = followRequests.firstIndex(where: { $0.id == requestId })
        let followerUser = requestIndex.flatMap { followRequests[$0].follower }
        let followerId = followerUser?.id
        
        // Remove request from local array immediately to prevent double handling
        if requestIndex != nil {
            followRequests.remove(at: requestIndex!)
        }
        
        print("📡 Accepting follow request ID \(requestId)")
        
        UserAPI.shared.acceptFollowRequest(requestId: requestId)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                
                switch completionStatus {
                case .finished:
                    print("✅ Accept request completed successfully")
                    // Don't call completion here - we handle it in receiveValue
                case .failure(let err):
                    self.error = err.localizedDescription
                    print("❌ Failed to accept follow request: \(err.localizedDescription)")
                    completion(false)
                }
            } receiveValue: { response in
                print("✅ Follow request accepted: \(response.message ?? "Success")")
                
                // Update follower count
                if var currentUser = self.user {
                    currentUser.followerCount += 1
                    self.user = currentUser
                    print("📊 Updated follower count to \(currentUser.followerCount)")
                }
                
                // If we're viewing the profile of the user who sent the request,
                // update their following status
                if let followerId = followerId,
                   let currentUser = self.user,
                   currentUser.id == followerId {
                    var updatedUser = currentUser
                    updatedUser.isFollowing = true
                    updatedUser.isPending = false
                    self.user = updatedUser
                    print("🔄 Updated following status for user \(followerId)")
                }
                
                // Refresh the profile data to ensure everything is current
                if let userId = self.user?.id {
                    self.fetchUserProfile(userId: userId)
                }
                
                completion(true)
            }
            .store(in: &cancellables)
    }

    func rejectFollowRequest(requestId: Int, completion: @escaping (Bool) -> Void) {
        isLoading = true
        error = nil

        // Remove the request from the local array immediately
        if let index = followRequests.firstIndex(where: { $0.id == requestId }) {
            followRequests.remove(at: index)
        }
        
        print("❌ REJECT_REQUEST: Explicitly rejecting follow request ID \(requestId)")
        
        // Log more details for debugging
        let userId = followRequests.first(where: { $0.id == requestId })?.follower.id
        print("❌ REJECT_REQUEST: Request from user ID: \(userId ?? -1)")
        
        UserAPI.shared.rejectFollowRequest(requestId: requestId)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                
                switch completionStatus {
                case .finished:
                    print("❌ REJECT_REQUEST: Completed successfully")
                    // Don't call completion here - we handle it in receiveValue
                case .failure(let err):
                    self.error = err.localizedDescription
                    print("❌ REJECT_REQUEST: Failed: \(err.localizedDescription)")
                    completion(false)
                }
            } receiveValue: { response in
                // This is the key change - don't update any follower counts or states
                // for rejections, even though the response comes back as "success: true"
                print("✅ Follow request rejected: \(response.message ?? "Success")")
                
                // Make sure to NOT update the user's following status here
                // That's the key difference between accept and reject handling
                
                // Refresh follow requests to update UI 
                // Note: We're refreshing all pending requests, not using requestId parameter
                self.fetchFollowRequests(userId: AuthManager.shared.currentUser?.id ?? 0)
                
                completion(true)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Follow Requests Management
    
    // BUGFIX: Add wrapper functions to ensure correct handling even if view bindings are incorrect
    
    // Safe wrapper function for accepting follow requests
    // This ensures we're ALWAYS calling accept and never reject
    func safeAcceptRequest(requestId: Int, completion: @escaping (Bool) -> Void) {
        print("🔵 SAFE_ACCEPT: Called for request ID \(requestId)")
        acceptFollowRequest(requestId: requestId, completion: completion)
    }
    
    // Safe wrapper function for rejecting follow requests
    // This ensures we're ALWAYS calling reject and never accept
    func safeRejectRequest(requestId: Int, completion: @escaping (Bool) -> Void) {
        print("🔵 SAFE_REJECT: Called for request ID \(requestId)")
        rejectFollowRequest(requestId: requestId, completion: completion)
    }
    
    // In ProfileViewModel.swift, update the fetchOutgoingRequests method

    func fetchOutgoingRequests() {
        print("📊 Fetching outgoing follow requests")
        
        UserAPI.shared.getOutgoingFollowRequests()
            .receive(on: DispatchQueue.main)
            .sink { completion in
                if case let .failure(err) = completion {
                    print("❌ Failed to fetch outgoing requests: \(err.localizedDescription)")
                }
            } receiveValue: { requests in
                self.outgoingRequests = requests
                print("✅ Fetched \(requests.count) outgoing follow requests")
            }
            .store(in: &cancellables)
    }
    
    // Update fetchFollowRequests to use the new endpoint
    func fetchFollowRequests(userId: Int) {
        isLoading = true
        error = nil
        
        // Use the documented endpoint for pending follow requests
        UserAPI.shared.getPendingFollowRequests()
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoading = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                }
            } receiveValue: { requests in
                self.followRequests = requests
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Privacy Settings and Account Management
    
    @Published var privacySettings: PrivacySettings?
    @Published var isLoadingPrivacySettings = false
    
    // Fetch the user's privacy settings
    func fetchPrivacySettings() {
        isLoadingPrivacySettings = true
        error = nil
        
        UserAPI.shared.getPrivacySettings()
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoadingPrivacySettings = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                    print("❌ Failed to fetch privacy settings: \(err.localizedDescription)")
                }
            } receiveValue: { settings in
                self.privacySettings = settings
                print("✅ Received privacy settings: \(settings)")
            }
            .store(in: &cancellables)
    }
    
    // Update user's privacy settings
    func updatePrivacySettings(settings: PrivacySettings, completion: @escaping (Bool) -> Void) {
        isLoadingPrivacySettings = true
        error = nil
        
        UserAPI.shared.updatePrivacySettings(settings: settings)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isLoadingPrivacySettings = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                    print("❌ Failed to update privacy settings: \(err.localizedDescription)")
                    completion(false)
                }
            } receiveValue: { updatedSettings in
                self.privacySettings = updatedSettings
                print("✅ Privacy settings updated successfully")
                completion(true)
            }
            .store(in: &cancellables)
    }
    
    // Delete user account
    @Published var isDeletingAccount = false
    
    func deleteAccount(password: String, completion: @escaping (Bool, String?) -> Void) {
        isDeletingAccount = true
        error = nil
        
        UserAPI.shared.deleteAccount(password: password)
            .receive(on: DispatchQueue.main)
            .sink { completionStatus in
                self.isDeletingAccount = false
                if case let .failure(err) = completionStatus {
                    self.error = err.localizedDescription
                    print("❌ Account deletion failed: \(err.localizedDescription)")
                    completion(false, err.localizedDescription)
                }
            } receiveValue: { response in
                self.isDeletingAccount = false
                if response.success {
                    print("✅ Account deleted successfully")
                    // Trigger logout
                    AuthManager.shared.logout()
                    completion(true, "Your account has been deleted successfully.")
                } else {
                    print("⚠️ Account deletion response indicates failure: \(response.message ?? "Unknown error")")
                    self.error = response.message
                    completion(false, response.message)
                }
            }
            .store(in: &cancellables)
    }
}
