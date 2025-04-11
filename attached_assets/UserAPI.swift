import Foundation
import Combine

// User API for user-related requests
class UserAPI {
    static let shared = UserAPI()
    var cancellables = Set<AnyCancellable>()
    private let apiService = APIService.shared
    
    // Get user profile (using correct endpoint path from API docs)
    func getUserProfile(userId: Int) -> AnyPublisher<ProfileResponse, NetworkError> {
        print("🔍 Fetching user profile for ID: \(userId) using new API format")
        return apiService.request(endpoint: "/users/\(userId)", method: .get)
    }
    
    // Get user posts (using documented endpoint format)
    func getUserPosts(userId: Int) -> AnyPublisher<[ProfilePost], NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/posts", method: .get)
    }
    
    // Search users
    func searchUsers(query: String) -> AnyPublisher<[SimpleUser], NetworkError> {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return apiService.request(endpoint: "/users/search?q=\(encodedQuery)", method: .get)
    }
    
    // Get follow requests (pending incoming requests)
    func getFollowRequests(userId: Int) -> AnyPublisher<[FollowRequest], NetworkError> {
        return apiService.request(endpoint: "/follow-requests/pending", method: .get)
    }
    
    // Get pending follow requests (incoming)
    func getPendingFollowRequests() -> AnyPublisher<[FollowRequest], NetworkError> {
        print("🔍 Fetching pending follow requests using new API path")
        return apiService.request(endpoint: "/follow-requests/pending", method: .get)
    }
    
    // Get outgoing follow requests (sent by current user)
    func getOutgoingFollowRequests() -> AnyPublisher<[FollowRequest], NetworkError> {
        print("🔍 Fetching outgoing follow requests using new API path")
        return apiService.request(endpoint: "/follow-requests/outgoing", method: .get)
    }
    
    // Get followers
    func getFollowers(userId: Int) -> AnyPublisher<[SimpleUser], NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/followers", method: .get)
    }
    
    // Get following
    func getFollowing(userId: Int) -> AnyPublisher<[SimpleUser], NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/following", method: .get)
    }
    
    // Follow a user
    func followUser(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/follow", method: .post)
    }
    
    // Unfollow a user
    func unfollowUser(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/unfollow", method: .post)
    }
    
    // Remove a follower
    func removeFollower(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(endpoint: "/users/\(userId)/remove-follower", method: .post)
    }
    
    // Accept follow request
    func acceptFollowRequest(requestId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        print("✅ Accepting follow request ID \(requestId)")
        return apiService.request(endpoint: "/follow-requests/\(requestId)/accept", method: .post)
            .handleEvents(
                receiveSubscription: { _ in
                    print("🔶 Accept request subscribed for ID \(requestId)")
                },
                receiveOutput: { response in
                    print("✅ Accept request succeeded for ID \(requestId): \(response)")
                },
                receiveCompletion: { completion in
                    if case let .failure(error) = completion {
                        print("❌ Accept request failed for ID \(requestId): \(error)")
                    } else {
                        print("✅ Accept request completed successfully for ID \(requestId)")
                    }
                },
                receiveCancel: {
                    print("🚫 Accept request was cancelled for ID \(requestId)")
                }
            )
            .eraseToAnyPublisher()
    }
    
    // Reject follow request - using the new endpoint format with explicit debug logging
    func rejectFollowRequest(requestId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        print("❌ REJECT: Starting reject follow request ID \(requestId)")
        
        // Log the full API endpoint URL for debugging
        let endpoint = "/follow-requests/\(requestId)/reject"
        print("❌ REJECT: Using endpoint \(endpoint)")
        
        // Using explicit typing for the publisher
        let publisher: AnyPublisher<FollowResponse, NetworkError> = apiService.request(
            endpoint: endpoint,
            method: .post
        )
        
        return publisher
            .handleEvents(
                receiveSubscription: { _ in
                    print("❌ REJECT: Request subscribed for ID \(requestId)")
                },
                receiveOutput: { response in
                    print("❌ REJECT: Request succeeded for ID \(requestId): \(response)")
                },
                receiveCompletion: { completion in
                    if case let .failure(error) = completion {
                        print("❌ REJECT: Request failed for ID \(requestId): \(error)")
                    } else {
                        print("❌ REJECT: Request completed successfully for ID \(requestId)")
                    }
                },
                receiveCancel: {
                    print("❌ REJECT: Request was cancelled for ID \(requestId)")
                }
            )
            .eraseToAnyPublisher()
    }
    
    // MARK: - Privacy Settings
    
    // Get user's privacy settings
    func getPrivacySettings() -> AnyPublisher<PrivacySettings, NetworkError> {
        print("🔒 Fetching privacy settings")
        return apiService.request(endpoint: "/privacy", method: .get)
            .handleEvents(
                receiveCompletion: { completion in
                    if case let .failure(error) = completion {
                        print("❌ Failed to fetch privacy settings: \(error)")
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    // Update user's privacy settings
    func updatePrivacySettings(settings: PrivacySettings) -> AnyPublisher<PrivacySettings, NetworkError> {
        print("🔒 Updating privacy settings")
        return apiService.request(
            endpoint: "/privacy",
            method: .patch,
            parameters: settings.asDictionary()
        )
        .handleEvents(
            receiveCompletion: { completion in
                if case let .failure(error) = completion {
                    print("❌ Failed to update privacy settings: \(error)")
                }
            }
        )
        .eraseToAnyPublisher()
    }
    
    // MARK: - Account Management
    
    // Delete user account
    func deleteAccount(password: String) -> AnyPublisher<FollowResponse, NetworkError> {
        print("⚠️ Deleting user account")
        return apiService.request(
            endpoint: "/account/delete",
            method: .post,
            parameters: ["password": password]
        )
        .handleEvents(
            receiveOutput: { response in
                print("✅ Account deletion request succeeded: \(response)")
                // Clear auth credentials on successful deletion
                AuthManager.shared.logout()
            },
            receiveCompletion: { completion in
                if case let .failure(error) = completion {
                    print("❌ Account deletion failed: \(error)")
                }
            }
        )
        .eraseToAnyPublisher()
    }

    
    // Update user profile using the wrapper approach and PATCH method
    func updateProfile(name: String, bio: String?, isPrivate: Bool, profileImage: Data?) -> AnyPublisher<User, NetworkError> {
        guard let currentUser = AuthManager.shared.currentUser else {
            return Fail(error: NetworkError.unauthorized).eraseToAnyPublisher()
        }
        var parameters: [String: Any] = [
            "name": name,
            "isPrivate": isPrivate
        ]
        if let bio = bio {
            parameters["bio"] = bio
        }
        
        // Use PATCH for profile update with image; explicitly use HTTPMethod.patch
        let publisher: AnyPublisher<ProfileUpdateResponseWrapper, NetworkError>
        if let profileImage = profileImage {
            publisher = apiService.uploadMultipart(
                endpoint: "/user/profile",
                method: HTTPMethod.patch,
                parameters: parameters,
                imageData: [profileImage],
                imageFieldName: "photo"
            )
        } else {
            publisher = apiService.request(
                endpoint: "/user/profile",
                method: .patch,
                parameters: parameters
            )
        }
        
        return publisher
            .map { wrapper -> User in
                let response = wrapper.user
                return User(
                    id: response.id,
                    username: response.username,
                    displayName: response.name,   // API returns the display name in "name"
                    email: response.email,
                    bio: response.bio,
                    photo: response.photo,
                    followerCount: response.followerCount,
                    followingCount: response.followingCount,
                    isPrivate: response.isPrivate,
                    emailVerified: response.emailVerified,
                    role: response.role ?? currentUser.role,
                    isFollowing: currentUser.isFollowing,
                    isPending: currentUser.isPending
                )
            }
            .eraseToAnyPublisher()
    }
    
    // MARK: - Response Models for Profile Update
    
    // Wrapper for the profile update response matching the nested API JSON.
    struct ProfileUpdateResponseWrapper: Codable {
        let success: Bool
        let user: ProfileUpdateResponse
    }
    
    // Response structure for profile updates matching the API's response.
    struct ProfileUpdateResponse: Codable {
        let id: Int
        let username: String
        let email: String?
        let name: String       // API returns "name" instead of "displayName"
        let bio: String?
        let photo: String?
        let followerCount: Int
        let followingCount: Int
        let isPrivate: Bool
        let emailVerified: Bool?
        let role: String?
        
        private enum CodingKeys: String, CodingKey {
            case id, username, email, name, bio, photo, followerCount, followingCount, isPrivate, emailVerified, role
        }
    }
}

// MARK: - FollowResponse Struct

// Definition of FollowResponse so that it is in scope.
// This struct handles decoding various formats of follow response from the API.
struct FollowResponse: Codable {
    var success: Bool = true
    var message: String?
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? true
        message = try container.decodeIfPresent(String.self, forKey: .message)
    }
    
    enum CodingKeys: String, CodingKey {
        case success, message
    }
    
    init(success: Bool = true, message: String? = nil) {
        self.success = success
        self.message = message
    }
}

// MARK: - Privacy Settings Models

// Definition of NotificationPreferences
struct NotificationPreferences: Codable {
    var likes: Bool
    var comments: Bool
    var follows: Bool
    var messages: Bool
    
    func asDictionary() -> [String: Any] {
        return [
            "likes": likes,
            "comments": comments,
            "follows": follows,
            "messages": messages
        ]
    }
    
    init(likes: Bool = true, comments: Bool = true, follows: Bool = true, messages: Bool = true) {
        self.likes = likes
        self.comments = comments
        self.follows = follows
        self.messages = messages
    }
}

// Definition of PrivacySettings
struct PrivacySettings: Codable {
    var showEmail: Bool
    var allowTagging: Bool
    var allowDirectMessages: Bool
    var activityVisibility: String
    var notificationPreferences: NotificationPreferences
    
    enum CodingKeys: String, CodingKey {
        case showEmail, allowTagging, allowDirectMessages, activityVisibility, notificationPreferences
    }
    
    func asDictionary() -> [String: Any] {
        return [
            "showEmail": showEmail,
            "allowTagging": allowTagging,
            "allowDirectMessages": allowDirectMessages,
            "activityVisibility": activityVisibility,
            "notificationPreferences": notificationPreferences.asDictionary()
        ]
    }
    
    init(showEmail: Bool = false, 
         allowTagging: Bool = true, 
         allowDirectMessages: Bool = true, 
         activityVisibility: String = "followers",
         notificationPreferences: NotificationPreferences = NotificationPreferences()) {
        self.showEmail = showEmail
        self.allowTagging = allowTagging
        self.allowDirectMessages = allowDirectMessages
        self.activityVisibility = activityVisibility
        self.notificationPreferences = notificationPreferences
    }
}
