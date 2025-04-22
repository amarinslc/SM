

// AuthAPI.swift with phone number support
import Foundation
import Combine

// Auth API for auth-related requests
class AuthAPI {
    static let shared = AuthAPI()
    
    private let apiService = APIService.shared
    
    // Login
    func login(username: String, password: String) -> AnyPublisher<AuthResponse, NetworkError> {
        print("🔑 Attempting login for user: \(username)")
        let parameters = ["username": username, "password": password]
        return apiService.request(endpoint: "/login", method: .post, parameters: parameters)
    }
    
    // Register with phone number support
    func register(username: String, email: String, password: String, confirmPassword: String,
                 name: String, phoneNumber: String, bio: String?, isPrivate: Bool?, profileImage: Data?) -> AnyPublisher<AuthResponse, NetworkError> {
        print("📝 Attempting to register user: \(username)")
        
        var parameters: [String: Any] = [
            "username": username,
            "email": email,
            "password": password,
            "confirmPassword": confirmPassword,
            "name": name,
            "phoneNumber": phoneNumber // Added phone number parameter
        ]
        
        if let bio = bio {
            parameters["bio"] = bio
        }
        
        if let isPrivate = isPrivate {
            parameters["isPrivate"] = isPrivate
        }
        
        if let profileImage = profileImage {
            print("🖼️ Image data size: \(profileImage.count) bytes")
            return apiService.uploadMultipart(
                endpoint: "/register",
                parameters: parameters,
                imageData: [profileImage],
                imageFieldName: "photo"
            )
        } else {
            return apiService.request(
                endpoint: "/register",
                method: .post,
                parameters: parameters
            )
        }
    }
    
    // Get current user
    func getCurrentUser() -> AnyPublisher<AuthResponse, NetworkError> {
        print("👤 Fetching current user")
        return apiService.request(endpoint: "/user")
    }
    
    // Logout
    func logout() -> AnyPublisher<EmptyResponse, NetworkError> {
        print("🚪 Logging out")
        return apiService.request(endpoint: "/logout", method: .post)
    }
    
    // Test the API connection
    func testConnection() -> AnyPublisher<ServerInfo, NetworkError> {
        print("🔄 Testing API connection")
        return apiService.request(endpoint: "/storage/health")
    }
}

struct ServerInfo: Decodable {
    let status: String
}
