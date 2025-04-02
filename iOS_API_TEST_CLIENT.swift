// API Test Client for Dunbar iOS App
// This file contains sample code for testing the API endpoints

import Foundation
import UIKit

// MARK: - Constants

struct Constants {
    struct API {
        static let baseURL = "https://dbsocial.replit.app/api"
        
        // Auth endpoints
        static let login = "/login"
        static let register = "/register"
        static let logout = "/logout"
        static let currentUser = "/user"
        
        // User endpoints
        static let users = "/users"
        static let userPosts = "/users/%d/posts" // Format with userId
        
        // Posts endpoints
        static let posts = "/posts"
        static let feed = "/feed"
        
        // Comments endpoints
        static let postComments = "/posts/%d/comments" // Format with postId
        
        // Follow endpoints
        static let follow = "/users/%d/follow" // Format with userId
        static let unfollow = "/users/%d/unfollow" // Format with userId
        static let followers = "/users/%d/followers" // Format with userId
        static let following = "/users/%d/following" // Format with userId
        static let pendingRequests = "/users/%d/requests" // Format with userId
        static let outgoingRequests = "/users/%d/outgoing-requests" // Format with userId
        
        // System endpoints
        static let healthCheck = "/storage/health"
    }
}

// MARK: - API Test Client

class APITestClient {
    // Singleton instance
    static let shared = APITestClient()
    
    private let session: URLSession
    
    private init() {
        let config = URLSessionConfiguration.default
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.timeoutIntervalForResource = 30
        session = URLSession(configuration: config)
    }
    
    // MARK: - Test Methods
    
    func runFullAPITest() {
        print("🔍 Starting full API test sequence")
        
        // 1. Wake up the server
        testWakeupServer { [weak self] success in
            guard success, let self = self else {
                print("❌ Server wakeup failed. Aborting tests.")
                return
            }
            
            // 2. Test login
            self.testLogin(username: "testuser", password: "password") { success, user in
                if success, let user = user {
                    print("✅ Login successful: \(user.username)")
                    
                    // 3. Test getting user posts
                    self.testGetUserPosts(userId: user.id)
                    
                    // 4. Test getting feed
                    self.testGetFeed()
                    
                    // 5. Test searching users
                    self.testSearchUsers(query: "a")
                    
                    // 6. Test comment on a post
                    // This would require a post ID, which we don't have yet
                    
                    // 7. Test logout at the end
                    self.testLogout()
                } else {
                    print("❌ Login failed. Aborting remaining tests.")
                }
            }
        }
    }
    
    // MARK: - Individual Test Methods
    
    func testWakeupServer(completion: @escaping (Bool) -> Void) {
        print("🔍 Testing server wakeup...")
        
        guard let url = URL(string: Constants.API.baseURL + Constants.API.healthCheck) else {
            print("❌ Invalid URL")
            completion(false)
            return
        }
        
        let task = session.dataTask(with: url) { data, response, error in
            if let error = error {
                print("❌ Wakeup error: \(error.localizedDescription)")
                completion(false)
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid response")
                completion(false)
                return
            }
            
            let success = httpResponse.statusCode == 200
            
            if success {
                print("✅ Server is awake and ready!")
                if let data = data, let responseString = String(data: data, encoding: .utf8) {
                    print("📊 Health response: \(responseString)")
                }
            } else {
                print("❌ Wakeup failed with status: \(httpResponse.statusCode)")
            }
            
            completion(success)
        }
        
        task.resume()
    }
    
    func testLogin(username: String, password: String, completion: @escaping (Bool, User?) -> Void) {
        print("🔍 Testing login...")
        
        guard let url = URL(string: Constants.API.baseURL + Constants.API.login) else {
            print("❌ Invalid URL")
            completion(false, nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let credentials = ["username": username, "password": password]
        
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: credentials)
            request.httpBody = jsonData
            
            let task = session.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("❌ Login error: \(error.localizedDescription)")
                    completion(false, nil)
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    print("❌ Invalid response")
                    completion(false, nil)
                    return
                }
                
                if httpResponse.statusCode != 200 {
                    print("❌ Login failed with status: \(httpResponse.statusCode)")
                    if let data = data, let errorString = String(data: data, encoding: .utf8) {
                        print("📊 Error response: \(errorString)")
                    }
                    completion(false, nil)
                    return
                }
                
                guard let data = data else {
                    print("❌ No data received")
                    completion(false, nil)
                    return
                }
                
                do {
                    let decoder = JSONDecoder()
                    decoder.dateDecodingStrategy = .iso8601
                    let user = try decoder.decode(User.self, from: data)
                    print("✅ Login successful")
                    completion(true, user)
                } catch {
                    print("❌ Failed to decode user: \(error.localizedDescription)")
                    if let dataString = String(data: data, encoding: .utf8) {
                        print("📊 Raw response: \(dataString)")
                    }
                    completion(false, nil)
                }
            }
            
            task.resume()
        } catch {
            print("❌ Failed to serialize login data: \(error.localizedDescription)")
            completion(false, nil)
        }
    }
    
    func testGetUserPosts(userId: Int) {
        print("🔍 Testing get user posts for userId \(userId)...")
        
        // Test all supported endpoints to compare results
        
        // Endpoint 1: /users/:id/posts (preferred)
        let endpoint1 = String(format: Constants.API.userPosts, userId)
        makeGetRequest(endpoint: endpoint1, responseType: [Post].self) { result in
            switch result {
            case .success(let posts):
                print("✅ User posts (endpoint 1) retrieved successfully: \(posts.count) posts")
                for (index, post) in posts.prefix(3).enumerated() {
                    print("   Post \(index + 1): \(post.content.prefix(30))...")
                }
            case .failure(let error):
                print("❌ Failed to get user posts (endpoint 1): \(error.localizedDescription)")
            }
        }
        
        // Endpoint 2: /posts/:id (path parameter)
        let endpoint2 = Constants.API.posts + "/\(userId)"
        makeGetRequest(endpoint: endpoint2, responseType: [Post].self) { result in
            switch result {
            case .success(let posts):
                print("✅ User posts (endpoint 2) retrieved successfully: \(posts.count) posts")
            case .failure(let error):
                print("❌ Failed to get user posts (endpoint 2): \(error.localizedDescription)")
            }
        }
        
        // Endpoint 3: /posts?userId=id (query parameter)
        let endpoint3 = Constants.API.posts + "?userId=\(userId)"
        makeGetRequest(endpoint: endpoint3, responseType: [Post].self) { result in
            switch result {
            case .success(let posts):
                print("✅ User posts (endpoint 3) retrieved successfully: \(posts.count) posts")
            case .failure(let error):
                print("❌ Failed to get user posts (endpoint 3): \(error.localizedDescription)")
            }
        }
    }
    
    func testGetFeed() {
        print("🔍 Testing get feed...")
        
        makeGetRequest(endpoint: Constants.API.feed, responseType: [Post].self) { result in
            switch result {
            case .success(let posts):
                print("✅ Feed retrieved successfully: \(posts.count) posts")
                for (index, post) in posts.prefix(3).enumerated() {
                    print("   Post \(index + 1) by \(post.user.username): \(post.content.prefix(30))...")
                }
            case .failure(let error):
                print("❌ Failed to get feed: \(error.localizedDescription)")
            }
        }
    }
    
    func testSearchUsers(query: String) {
        print("🔍 Testing search users with query: \(query)...")
        
        makeGetRequest(endpoint: Constants.API.users + "/search?q=\(query)", responseType: [User].self) { result in
            switch result {
            case .success(let users):
                print("✅ Users search successful: \(users.count) users found")
                for (index, user) in users.prefix(5).enumerated() {
                    print("   User \(index + 1): \(user.username)")
                }
            case .failure(let error):
                print("❌ Failed to search users: \(error.localizedDescription)")
            }
        }
    }
    
    func testLogout() {
        print("🔍 Testing logout...")
        
        guard let url = URL(string: Constants.API.baseURL + Constants.API.logout) else {
            print("❌ Invalid URL")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ Logout error: \(error.localizedDescription)")
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                print("❌ Invalid response")
                return
            }
            
            if httpResponse.statusCode == 200 {
                print("✅ Logout successful")
            } else {
                print("❌ Logout failed with status: \(httpResponse.statusCode)")
                if let data = data, let errorString = String(data: data, encoding: .utf8) {
                    print("📊 Error response: \(errorString)")
                }
            }
        }
        
        task.resume()
    }
    
    // MARK: - Helper Methods
    
    private func makeGetRequest<T: Decodable>(endpoint: String, responseType: T.Type, completion: @escaping (Result<T, Error>) -> Void) {
        guard let url = URL(string: Constants.API.baseURL + endpoint) else {
            completion(.failure(NSError(domain: "Invalid URL", code: -1, userInfo: nil)))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        // Log cookies being sent
        print("🍪 Cookies for request to \(endpoint): \(HTTPCookieStorage.shared.cookies(for: url) ?? [])")
        
        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NSError(domain: "Invalid response", code: -1, userInfo: nil)))
                return
            }
            
            // Log response status and cookies
            print("📲 Response status for \(endpoint): \(httpResponse.statusCode)")
            print("🍪 Cookies after response: \(HTTPCookieStorage.shared.cookies(for: url) ?? [])")
            
            if httpResponse.statusCode != 200 {
                completion(.failure(NSError(domain: "API Error", code: httpResponse.statusCode, userInfo: nil)))
                if let data = data, let errorString = String(data: data, encoding: .utf8) {
                    if errorString.contains("<!DOCTYPE html>") {
                        print("⚠️ Received HTML response instead of JSON")
                    } else {
                        print("📊 Error response: \(errorString)")
                    }
                }
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "No data", code: -1, userInfo: nil)))
                return
            }
            
            do {
                // Try to log the raw response for debugging
                if let jsonString = String(data: data, encoding: .utf8) {
                    let previewLength = min(jsonString.count, 200)
                    let preview = jsonString.prefix(previewLength)
                    print("📄 Response data preview: \(preview)...")
                }
                
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let result = try decoder.decode(T.self, from: data)
                completion(.success(result))
            } catch {
                print("❌ Decoding error: \(error)")
                completion(.failure(error))
            }
        }
        
        task.resume()
    }
}

// MARK: - Usage Example

/*
func testAPI() {
    // First, wake up the server
    APITestClient.shared.testWakeupServer { success in
        guard success else {
            print("Cannot proceed with tests - server is not responding")
            return
        }
        
        // Then run full test sequence
        APITestClient.shared.runFullAPITest()
        
        // Or test individual endpoints
        APITestClient.shared.testLogin(username: "testuser", password: "password") { success, user in
            if success, let userId = user?.id {
                APITestClient.shared.testGetUserPosts(userId: userId)
            }
        }
    }
}
*/