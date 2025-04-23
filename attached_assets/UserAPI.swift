import Foundation
import Combine

// User API for user-related requests
class UserAPI {
    static let shared = UserAPI()
    var cancellables = Set<AnyCancellable>()
    private let apiService = APIService.shared
    
    // Get user profile (using correct endpoint path from API docs)
    func getUserProfile(userId: Int) -> AnyPublisher<ProfileResponse, NetworkError> {
        //print("🔍 Fetching user profile for ID: \(userId) using new API format")
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
        //print("🔍 Fetching pending follow requests using new API path")
        return apiService.request(endpoint: "/follow-requests/pending", method: .get)
    }
    
    // Get outgoing follow requests (sent by current user)
    func getOutgoingFollowRequests() -> AnyPublisher<[FollowRequest], NetworkError> {
        //print("🔍 Fetching outgoing follow requests using new API path")
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
        //print("✅ Accepting follow request ID \(requestId)")
        return apiService.request(endpoint: "/follow-requests/\(requestId)/accept", method: .post)
    }
    
    // Reject follow request - using the new endpoint format
    func rejectFollowRequest(requestId: Int) -> AnyPublisher<FollowResponse, NetworkError> {
        //print("❌ STARTING Reject follow request ID \(requestId)")
        
        // Using explicit typing for the publisher
        let publisher: AnyPublisher<FollowResponse, NetworkError> = apiService.request(
            endpoint: "/follow-requests/\(requestId)/reject",
            method: .post
        )
        
        return publisher
            .handleEvents(
                receiveSubscription: { _ in
                    //print("🔶 Reject request subscribed for ID \(requestId)")
                },
                receiveOutput: { response in
                    //print("✅ Reject request succeeded for ID \(requestId): \(response)")
                },
                receiveCompletion: { completion in
                    if case let .failure(error) = completion {
                        //print("❌ Reject request failed for ID \(requestId): \(error)")
                    } else {
                        //print("✅ Reject request completed successfully for ID \(requestId)")
                    }
                },
                receiveCancel: {
                    //print("🚫 Reject request was cancelled for ID \(requestId)")
                }
            )
            .eraseToAnyPublisher()
    }

    
    // Update user profile using the wrapper approach and PATCH method
     func updateProfile(
         name: String,
         bio: String?,
         isPrivate: Bool,
         profileImage: Data?,
         phoneNumber: String?      // ← new
    ) -> AnyPublisher<User, NetworkError> {
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
            if let phone = phoneNumber {
                parameters["phoneNumber"] = phone
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
                    phoneNumber: response.phoneNumber,
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
        let name: String // API returns "name" instead of "displayName"
        let phoneNumber: String?
        let bio: String?
        let photo: String?
        let followerCount: Int
        let followingCount: Int
        let isPrivate: Bool
        let emailVerified: Bool?
        let role: String?
        
        private enum CodingKeys: String, CodingKey {
               case id, username, email, name
               case phoneNumber           // ← add this
               case bio, photo,
                    followerCount,
                    followingCount,
                    isPrivate,
                    emailVerified,
                    role
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

extension UserAPI {
    // Account Deletion API call.
    // iOS-compatible: POST /api/account/delete with password in request body.
    func deleteAccount(password: String) -> AnyPublisher<DeleteAccountResponse, NetworkError> {
        let params = ["password": password]
        return apiService.request(endpoint: "/account/delete", method: .post, parameters: params)
    }
    
    /// Fetch the user's current privacy settings (including showPhoneNumber)
    func getPrivacySettings() -> AnyPublisher<PrivacySettings, NetworkError> {
        print("🔍 Fetching privacy settings from /user/privacy-settings")
        return apiService
            .request(endpoint: "/user/privacy-settings", method: .get)
            .handleEvents(
                receiveOutput: { settings in
                    print("✅ Received privacy settings:", settings)
                },
                receiveCompletion: { completion in
                    if case let .failure(err) = completion {
                        print("❌ Error fetching privacy settings:", err.localizedDescription)
                    }
                }
            )
            .eraseToAnyPublisher()
    }

    /// Patch any changed privacy settings, including showPhoneNumber
    func updatePrivacySettings(settings: [String: Any]) -> AnyPublisher<PrivacySettings, NetworkError> {
        print("🔄 Patching privacy settings with payload:", settings)
        return apiService
            .request(
                endpoint: "/user/privacy-settings",
                method: .patch,
                parameters: settings
            )
            .handleEvents(
                receiveOutput: { updated in
                    print("✅ Privacy settings updated to:", updated)
                },
                receiveCompletion: { completion in
                    if case let .failure(err) = completion {
                        print("❌ Error updating privacy settings:", err.localizedDescription)
                    }
                }
            )
            .eraseToAnyPublisher()
    }
}

// Response models

struct DeleteAccountResponse: Codable {
    let message: String
    // Make success optional and default to true if absent.
    let success: Bool?

    private enum CodingKeys: String, CodingKey {
        case message
        case success
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.message = try container.decode(String.self, forKey: .message)
        // If the key "success" is missing, assume a default of true.
        self.success = try container.decodeIfPresent(Bool.self, forKey: .success) ?? true
    }
}

// PrivacySettings model – extended to include new settings.
struct PrivacySettings: Codable {
    var showEmail: Bool
    var allowTagging: Bool
    var activityVisibility: String
    var showPhoneNumber: Bool
    var notificationPreferences: NotificationPreferences
    // New keys added for user consent settings
    var privacyAgreement: Bool?
    var dataConsent: Bool?
    
    private enum CodingKeys: String, CodingKey {
        case showEmail
        case showPhoneNumber          // ← new
        case allowTagging, activityVisibility,
             notificationPreferences,
             privacyAgreement, dataConsent
    }
}

struct NotificationPreferences: Codable {
    var likes: Bool
    var comments: Bool
    var follows: Bool
    var messages: Bool
}
