import Foundation
import Combine

// User API for user-related requests
class UserAPI {
    static let shared = UserAPI()
    
    // Add a cancellables set for storing subscriptions
    var cancellables = Set<AnyCancellable>()
    
    private let apiService = APIService.shared
    
    // Get user profile (using correct endpoint path from API docs)
    func getUserProfile(userId: Int) -> AnyPublisher<ProfileResponse, NetworkError> {
        print("🔍 Fetching user profile for ID: \(userId) using new API format")
        return apiService.request(
            endpoint: "/users/\(userId)",
            method: .get
        )
    }

    // Get user posts (using documented endpoint format)
    func getUserPosts(userId: Int) -> AnyPublisher<[ProfilePost], NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/posts",
            method: .get
        )
    }
    
    // Search users
    func searchUsers(query: String) -> AnyPublisher<[SimpleUser], NetworkError> {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return apiService.request(
            endpoint: "/users/search?q=\(encodedQuery)",
            method: .get
        )
    }
    
    // Get follow requests (pending incoming requests)
    func getFollowRequests(userId: Int) -> AnyPublisher<[FollowRequest], NetworkError> {
        // Using direct follow requests endpoint for logged in user per API docs
        return apiService.request(
            endpoint: "/follow-requests/pending",
            method: .get
        )
    }
    
    // Get pending follow requests (incoming)
    func getPendingFollowRequests() -> AnyPublisher<[FollowRequest], NetworkError> {
        print("🔍 Fetching pending follow requests using new API path")
        return apiService.request(
            endpoint: "/follow-requests/pending",
            method: .get
        )
    }
    
    // Get outgoing follow requests (sent by current user)
    func getOutgoingFollowRequests() -> AnyPublisher<[FollowRequest], NetworkError> {
        print("🔍 Fetching outgoing follow requests using new API path")
        return apiService.request(
            endpoint: "/follow-requests/outgoing",
            method: .get
        )
    }
    
    // Get followers
    func getFollowers(userId: Int) -> AnyPublisher<[SimpleUser], NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/followers",
            method: .get
        )
    }
    
    // Get following
    func getFollowing(userId: Int) -> AnyPublisher<[SimpleUser], NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/following",
            method: .get
        )
    }
    
    // Follow a user
    func followUser(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/follow",
            method: .post
        )
    }
    
    // Unfollow a user
    func unfollowUser(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/unfollow",
            method: .post
        )
    }
    
    // Remove a follower
    func removeFollower(userId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        return apiService.request(
            endpoint: "/users/\(userId)/remove-follower",
            method: .post
        )
    }
    
    // Accept follow request
    func acceptFollowRequest(requestId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        print("✅ Accepting follow request ID \(requestId)")
        return apiService.request(
            endpoint: "/follow-requests/\(requestId)/accept",
            method: .post
        )
    }
    
    // Reject follow request - using the new endpoint format
    func rejectFollowRequest(requestId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        print("❌ Rejecting follow request ID \(requestId) using new API path")
        return apiService.request(
            endpoint: "/follow-requests/\(requestId)/reject",
            method: .post
        )
    }
    
    // Update user profile - fixed to use proper endpoint format from API docs
    func updateProfile(name: String, bio: String?, isPrivate: Bool, profileImage: Data?) -> AnyPublisher<User, NetworkError> {
        guard let currentUser = AuthManager.shared.currentUser else {
            return Fail(error: NetworkError.unauthorized).eraseToAnyPublisher()
        }
        
        // Build parameters
        var parameters: [String: Any] = [
            "name": name,
            "isPrivate": isPrivate
        ]
        
        if let bio = bio {
            parameters["bio"] = bio
        }
        
        // Choose appropriate publisher based on whether we have an image
        let publisher: AnyPublisher<ProfileUpdateResponse, NetworkError>
        
        // Choose between multipart for images or regular JSON for text-only
        if let profileImage = profileImage {
            publisher = apiService.uploadMultipart(
                endpoint: "/user/profile",
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
        
        // Now map the response to a User object
        return publisher
            .map { response -> User in
                return User(
                    id: response.id,
                    username: response.username,
                    displayName: response.name,  // Note: Server now uses "name" field
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

    // Special response structure for profile updates that matches the actual API response
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
        
        // Ignore these security-sensitive fields during decoding
        private enum CodingKeys: String, CodingKey {
            case id, username, email, name, bio, photo, followerCount, followingCount, isPrivate, emailVerified, role
            // Explicitly exclude "password", "verificationToken", "resetPasswordToken", "resetPasswordExpires"
        }
    }
}

// FollowResponse struct with improved handling of different response formats
struct FollowResponse: Codable {
    var success: Bool = true  // Default to true
    var message: String?
    
    // Custom initializer to handle different API response formats
    init(from decoder: Decoder) throws {
        let container: KeyedDecodingContainer<CodingKeys>
        
        do {
            container = try decoder.container(keyedBy: CodingKeys.self)
            success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? true
            message = try container.decodeIfPresent(String.self, forKey: .message)
        } catch {
            // For plain text responses like "OK"
            let singleValueContainer = try? decoder.singleValueContainer()
            if let stringValue = try? singleValueContainer?.decode(String.self) {
                message = stringValue
                success = true
            }
        }
        
        // Set success to true if we have a message about follow request
        if message?.contains("Follow request sent") == true {
            success = true
        }
    }
    
    enum CodingKeys: String, CodingKey {
        case success, message
    }
    
    // Regular initializer for fallbacks
    init(success: Bool = true, message: String? = nil) {
        self.success = success
        self.message = message
    }
}
