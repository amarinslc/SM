# Dunbar Social API Documentation for iOS Integration

> **IMPORTANT UPDATE (April 2025)**: Authentication and user profile endpoints now return relationship status information. All user-related responses have been updated to a consistent format that includes `isFollowing` and `isPending` flags to indicate the relationship between users. See the updated response formats in the endpoint documentation below.

## Base URL
- Development: `http://localhost:5000/api`
- Production: `https://dbsocial.replit.app/api`

## Authentication
The API uses cookie-based authentication. When the user logs in, session cookies are set automatically if using proper cookie handling in the client code.

### Important Notes for iOS Integration:
1. Your iOS app must properly handle cookies for authentication to work
2. The Replit server goes to sleep after inactivity and needs a "wake-up" call on app start
3. API responses may be delayed during initial wakeup (up to 20 seconds)

## API Endpoints

### Authentication

#### Login
- **URL**: `/login`
- **Method**: `POST`
- **Description**: Authenticate a user and create a session
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response**: User object with relationship status
  ```json
  {
    "user": {
      "id": 1,
      "username": "jdoe",
      "email": "john.doe@example.com",
      "bio": "Hello world",
      "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/profile.jpg",
      "isAdmin": false,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "isPrivate": true,
      "displayName": "John Doe"
    },
    "isFollowing": false,
    "isPending": false
  }
  ```
- **Error Responses**:
  - 401 Unauthorized: Invalid credentials
  
> **Note**: The `isFollowing` and `isPending` values will always be `false` for your own profile, but this format is used for consistency with other user profile endpoints.

#### Register
- **URL**: `/register`
- **Method**: `POST`
- **Description**: Create a new user account
- **Request Body**:
  ```json
  {
    "username": "string",
    "email": "string",
    "password": "string",
    "displayName": "string"
  }
  ```
- **Response**: User object with relationship status (same format as login)
  ```json
  {
    "user": {
      "id": 1,
      "username": "jdoe",
      "email": "john.doe@example.com",
      "bio": null,
      "photo": null,
      "isAdmin": false,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "isPrivate": true,
      "displayName": "John Doe",
      "message": "Please check your email to verify your account"
    },
    "isFollowing": false,
    "isPending": false
  }
  ```
- **Error Responses**:
  - 400 Bad Request: Username already exists or invalid data

#### Logout
- **URL**: `/logout`
- **Method**: `POST`
- **Description**: End the user's session
- **Request Body**: None
- **Response**: Status 200 on success

#### Get Current User
- **URL**: `/user`
- **Method**: `GET`
- **Description**: Get the currently authenticated user
- **Response**: User object with relationship status (same format as login) or 401 if not logged in
  ```json
  {
    "user": {
      "id": 1,
      "username": "jdoe",
      "email": "john.doe@example.com",
      "bio": "Hello world",
      "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/profile.jpg",
      "isAdmin": false,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "isPrivate": true,
      "displayName": "John Doe",
      "emailVerified": true
    },
    "isFollowing": false,
    "isPending": false
  }
  ```

### User Management

#### Get User Profile
- **URL**: `/users/:id`
- **Method**: `GET`
- **Description**: Get a user's profile
- **Response**: User profile with following status
  ```json
  {
    "user": {
      "id": 1,
      "username": "jdoe",
      "displayName": "John Doe",
      "bio": "Hello world",
      "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/profile.jpg",
      "isPrivate": true,
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "isFollowing": false,
    "isPending": false
  }
  ```

#### Update User Profile
- **URL**: `/users/:id`
- **Method**: `PATCH`
- **Description**: Update a user's profile
- **Request Body**: (all fields optional)
  ```json
  {
    "displayName": "string",
    "bio": "string",
    "isPrivate": boolean
  }
  ```
- **Response**: Updated user object
- **Notes**: Can only update your own profile unless admin

#### Upload Profile Photo
- **URL**: `/users/:id/photo`
- **Method**: `POST`
- **Description**: Upload a profile photo (multipart form data)
- **Request Body**: Form data with 'photo' field containing image file
- **Response**: Updated user object with photo URL
- **Notes**: Only the user themselves or an admin can upload a photo

### Posts

#### Create Post
- **URL**: `/posts`
- **Method**: `POST`
- **Description**: Create a new post
- **Request Body**: Form data with 'content' field (text) and optional 'media' files
- **Response**: Created post object
  ```json
  {
    "id": 1,
    "content": "Hello world",
    "media": [
      "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/post1.jpg"
    ],
    "userId": 1,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "user": {
      "id": 1,
      "username": "jdoe",
      "displayName": "John Doe",
      "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/profile.jpg"
    }
  }
  ```

#### Get User Posts
- **URL**: There are two supported formats:
  - `/users/:id/posts` (preferred for iOS)
  - `/posts/:id` (path parameter)
  - `/posts?userId=id` (query parameter)
- **Method**: `GET`
- **Description**: Get posts from a specific user
- **Response**: Array of post objects
- **Notes**: Only returns posts if user is followed or account is public

**Important**: Use the `/users/:id/posts` format for iOS integration as it's explicitly designed for the iOS app.

#### Get Feed
- **URL**: `/feed`
- **Method**: `GET`
- **Description**: Get posts from followed users
- **Response**: Array of post objects

#### Delete Post
- **URL**: `/posts/:id`
- **Method**: `DELETE`
- **Description**: Delete a post
- **Response**: Status 200 on success
- **Notes**: Can only delete your own posts unless admin

### Comments

#### Add Comment
- **URL**: `/posts/:id/comments`
- **Method**: `POST`
- **Description**: Add a comment to a post
- **Request Body**:
  ```json
  {
    "content": "string"
  }
  ```
- **Response**: Created comment object
  ```json
  {
    "id": 1,
    "content": "Great post!",
    "postId": 1,
    "userId": 2,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "user": {
      "id": 2,
      "username": "sarah",
      "displayName": "Sarah Smith",
      "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/sarah.jpg"
    }
  }
  ```

#### Get Comments
- **URL**: `/posts/:id/comments`
- **Method**: `GET`
- **Description**: Get comments for a post
- **Response**: Array of comment objects

### Follow Management

#### Follow User
- **URL**: `/users/:id/follow`
- **Method**: `POST`
- **Description**: Follow a user or send a follow request if account is private
- **Response**: Status 200 and a message indicating follow status or pending request

#### Unfollow User
- **URL**: `/users/:id/unfollow`
- **Method**: `POST`
- **Description**: Unfollow a user
- **Response**: Status 200 on success

#### Remove Follower
- **URL**: `/followers/:id/remove`
- **Method**: `POST`
- **Description**: Remove a follower from your followers list
- **Response**: Status 200 on success

#### Get Followers
- **URL**: `/users/:id/followers`
- **Method**: `GET`
- **Description**: Get a user's followers
- **Response**: Array of user objects
- **Notes**: Can only view your own followers list

#### Get Following
- **URL**: `/users/:id/following`
- **Method**: `GET`
- **Description**: Get users that a user is following
- **Response**: Array of user objects
- **Notes**: Can only view your own following list

#### Get Pending Follow Requests
- **URL**: `/follow-requests/pending`
- **Method**: `GET`
- **Description**: Get follow requests waiting for approval
- **Response**: Array of follow request objects
  ```json
  [
    {
      "id": 1,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "follower": {
        "id": 2,
        "username": "sarah",
        "displayName": "Sarah Smith",
        "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/sarah.jpg"
      }
    }
  ]
  ```

#### Get Outgoing Follow Requests
- **URL**: `/follow-requests/outgoing`
- **Method**: `GET`
- **Description**: Get follow requests sent to others
- **Response**: Array of follow request objects
  ```json
  [
    {
      "id": 1,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "following": {
        "id": 3,
        "username": "alex",
        "displayName": "Alex Johnson",
        "photo": "https://res.cloudinary.com/dgrs48tas/image/upload/v123456789/alex.jpg"
      }
    }
  ]
  ```

#### Accept Follow Request
- **URL**: `/follow-requests/:id/accept`
- **Method**: `POST`
- **Description**: Accept a follow request
- **Response**: Status 200 on success

#### Reject Follow Request
- **URL**: `/follow-requests/:id/reject`
- **Method**: `POST`
- **Description**: Reject a follow request
- **Response**: Status 200 on success

### User Search

#### Search Users
- **URL**: `/users/search?q=query`
- **Method**: `GET`
- **Description**: Search for users by username or display name
- **Response**: Array of user objects
- **Notes**: Admin users are excluded from search results

### System Health

#### Health Check
- **URL**: `/storage/health`
- **Method**: `GET`
- **Description**: Check if the system is up and running
- **Response**: Status indicating service health
- **Notes**: Use this endpoint as a "wake-up" call when your app starts

## iOS Implementation Notes

### Handling Authentication
Use URLSession with proper cookie handling:

```swift
let config = URLSessionConfiguration.default
config.httpShouldSetCookies = true
config.httpCookieAcceptPolicy = .always
config.httpCookieStorage = HTTPCookieStorage.shared
    
let session = URLSession(configuration: config)
```

### Wake-up Function
Implement a function to wake up the Replit server when your app starts. This is a critical step because Replit deployments go to sleep after inactivity:

```swift
func wakeupServer(completion: @escaping (Bool) -> Void) {
    guard let url = URL(string: Constants.API.baseURL + "/storage/health") else {
        completion(false)
        return
    }
    
    // Add a timeout since the server might take time to wake up
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForResource = 20 // 20 seconds timeout
    let session = URLSession(configuration: config)
    
    print("Waking up server...")
    
    let task = session.dataTask(with: url) { data, response, error in
        if let error = error {
            print("Wake-up error: \(error.localizedDescription)")
            completion(false)
            return
        }
        
        let success = (response as? HTTPURLResponse)?.statusCode == 200
        
        if success {
            print("Server awake and ready!")
            if let data = data, let responseString = String(data: data, encoding: .utf8) {
                print("Health response: \(responseString)")
            }
        } else {
            print("Server wake-up failed with status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
        }
        
        completion(success)
    }
    
    task.resume()
}
```

Call this method in your app's startup sequence:

```swift
// In AppDelegate or Application startup
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    
    // Show a loading indicator or splash screen
    
    // Wake up the server
    wakeupServer { success in
        DispatchQueue.main.async {
            if success {
                // Proceed with app initialization
                self.checkAuthentication()
            } else {
                // Show connection error or retry option
                self.showConnectionError()
            }
        }
    }
    
    return true
}
```

### API Error Handling

#### Comprehensive API Client
Create a robust network service with smart error handling, particularly for Replit's sleep behavior:

```swift
enum APIError: Error {
    case invalidURL
    case requestFailed(Error)
    case serverError(Int, String?)
    case responseDecodingFailed(Error)
    case unauthorized
    case noData
    case networkUnavailable
    case serverUnavailable
    case unknownError
    
    var isRetryable: Bool {
        switch self {
        case .serverUnavailable, .networkUnavailable:
            return true
        case .serverError(let code, _):
            // 5xx errors are server errors that might be retryable
            return code >= 500 && code < 600
        default:
            return false
        }
    }
    
    var localizedDescription: String {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .requestFailed(let error):
            return "Request failed: \(error.localizedDescription)"
        case .serverError(let code, let message):
            if let message = message {
                return "Server error (\(code)): \(message)"
            }
            return "Server error (\(code))"
        case .responseDecodingFailed(let error):
            return "Failed to process the response: \(error.localizedDescription)"
        case .unauthorized:
            return "You need to log in to continue"
        case .noData:
            return "The server returned an empty response"
        case .networkUnavailable:
            return "No internet connection available"
        case .serverUnavailable:
            return "The server is currently unavailable. It may be waking up, please try again."
        case .unknownError:
            return "An unknown error occurred"
        }
    }
}

class APIClient {
    static let shared = APIClient()
    
    private let baseURL: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    
    private var isServerAwake = false
    
    init(baseURL: String = Constants.API.baseURL) {
        self.baseURL = baseURL
        
        let config = URLSessionConfiguration.default
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.timeoutIntervalForResource = 30 // 30 seconds timeout
        
        self.session = URLSession(configuration: config)
        
        // Configure date decoding strategy
        decoder.dateDecodingStrategy = .iso8601
    }
    
    // Wake up server function
    func wakeupServer(completion: @escaping (Bool) -> Void) {
        request(
            endpoint: "/storage/health",
            method: "GET",
            responseType: [String: Any].self
        ) { result in
            switch result {
            case .success(_):
                self.isServerAwake = true
                completion(true)
            case .failure(_):
                self.isServerAwake = false
                completion(false)
            }
        }
    }
    
    // Generic request method with auto-retry capability
    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        additionalHeaders: [String: String]? = nil,
        retries: Int = 3,
        retryDelay: TimeInterval = 2.0,
        responseType: T.Type,
        completion: @escaping (Result<T, APIError>) -> Void
    ) {
        // Check network connectivity first
        if !NetworkMonitor.shared.isConnected {
            completion(.failure(.networkUnavailable))
            return
        }
        
        // If server is sleeping and this isn't a health check, wake it up first
        if !isServerAwake && !endpoint.contains("/storage/health") && retries == 3 {
            print("Server may be sleeping. Attempting to wake it up first...")
            wakeupServer { success in
                if success {
                    // Retry the original request now that server is awake
                    self.request(
                        endpoint: endpoint,
                        method: method,
                        body: body,
                        additionalHeaders: additionalHeaders,
                        retries: retries,
                        retryDelay: retryDelay,
                        responseType: responseType,
                        completion: completion
                    )
                } else {
                    completion(.failure(.serverUnavailable))
                }
            }
            return
        }
        
        guard let url = URL(string: baseURL + endpoint) else {
            completion(.failure(.invalidURL))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        
        // Set default headers
        if method == "POST" || method == "PATCH" || method == "PUT" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        // Add any additional headers
        additionalHeaders?.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }
        
        // Set body if provided
        if let body = body {
            request.httpBody = body
        }
        
        let task = session.dataTask(with: request) { data, response, error in
            // Handle network errors
            if let error = error {
                // Determine if retry is appropriate
                if retries > 0 {
                    print("Network error: \(error.localizedDescription). Retrying in \(retryDelay) seconds... (\(retries) attempts left)")
                    
                    DispatchQueue.global().asyncAfter(deadline: .now() + retryDelay) {
                        self.request(
                            endpoint: endpoint,
                            method: method,
                            body: body,
                            additionalHeaders: additionalHeaders,
                            retries: retries - 1,
                            retryDelay: retryDelay * 1.5,  // Exponential backoff
                            responseType: responseType,
                            completion: completion
                        )
                    }
                    return
                }
                
                completion(.failure(.requestFailed(error)))
                return
            }
            
            // Validate HTTP response
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(.unknownError))
                return
            }
            
            // Handle HTTP status codes
            switch httpResponse.statusCode {
            case 200...299:
                // Success case, continue processing
                break
                
            case 401:
                // Unauthorized - trigger login flow
                completion(.failure(.unauthorized))
                return
                
            case 408, 429, 500...599:
                // Retryable server errors
                if retries > 0 {
                    print("Server error: \(httpResponse.statusCode). Retrying in \(retryDelay) seconds... (\(retries) attempts left)")
                    
                    DispatchQueue.global().asyncAfter(deadline: .now() + retryDelay) {
                        self.request(
                            endpoint: endpoint,
                            method: method,
                            body: body,
                            additionalHeaders: additionalHeaders,
                            retries: retries - 1,
                            retryDelay: retryDelay * 1.5,  // Exponential backoff
                            responseType: responseType,
                            completion: completion
                        )
                    }
                    return
                }
                
                // Extract error message if available
                var errorMessage: String? = nil
                if let data = data {
                    do {
                        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let message = json["message"] as? String {
                            errorMessage = message
                        }
                    } catch {
                        // Just continue without error message
                    }
                }
                
                completion(.failure(.serverError(httpResponse.statusCode, errorMessage)))
                return
                
            default:
                // Non-retryable client errors
                var errorMessage: String? = nil
                if let data = data {
                    do {
                        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                           let message = json["message"] as? String {
                            errorMessage = message
                        }
                    } catch {
                        // Just continue without error message
                    }
                }
                
                completion(.failure(.serverError(httpResponse.statusCode, errorMessage)))
                return
            }
            
            // Check for empty response
            guard let data = data, !data.isEmpty else {
                // For endpoints that return no content (204)
                if httpResponse.statusCode == 204, T.self == EmptyResponse.self {
                    // Create an empty response for void endpoints
                    if let emptyResponse = EmptyResponse() as? T {
                        completion(.success(emptyResponse))
                    } else {
                        completion(.failure(.noData))
                    }
                    return
                }
                
                completion(.failure(.noData))
                return
            }
            
            // Parse JSON response
            do {
                let decodedResponse = try self.decoder.decode(T.self, from: data)
                completion(.success(decodedResponse))
            } catch {
                print("Decoding error: \(error)")
                
                // Log the response data for debugging
                if let jsonString = String(data: data, encoding: .utf8) {
                    print("Response data: \(jsonString)")
                }
                
                completion(.failure(.responseDecodingFailed(error)))
            }
        }
        
        task.resume()
    }
    
    // Convenience methods for different HTTP methods
    func get<T: Decodable>(
        endpoint: String,
        responseType: T.Type,
        completion: @escaping (Result<T, APIError>) -> Void
    ) {
        request(
            endpoint: endpoint,
            method: "GET",
            responseType: responseType,
            completion: completion
        )
    }
    
    func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U?,
        responseType: T.Type,
        completion: @escaping (Result<T, APIError>) -> Void
    ) {
        var bodyData: Data? = nil
        
        if let body = body {
            do {
                bodyData = try JSONEncoder().encode(body)
            } catch {
                completion(.failure(.requestFailed(error)))
                return
            }
        }
        
        request(
            endpoint: endpoint,
            method: "POST",
            body: bodyData,
            responseType: responseType,
            completion: completion
        )
    }
    
    // Similar methods for put, patch, delete...
}

// Empty response struct for void endpoints
struct EmptyResponse: Codable {}
```

### Check for Network Connectivity
Monitor network status to provide appropriate feedback to the user:

```swift
import Network

class NetworkMonitor {
    static let shared = NetworkMonitor()
    private let monitor = NWPathMonitor()
    private(set) var isConnected = false
    private(set) var connectionType: ConnectionType = .unknown
    
    enum ConnectionType {
        case wifi
        case cellular
        case ethernet
        case unknown
    }
    
    func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            self?.isConnected = path.status == .satisfied
            
            if path.usesInterfaceType(.wifi) {
                self?.connectionType = .wifi
            } else if path.usesInterfaceType(.cellular) {
                self?.connectionType = .cellular
            } else if path.usesInterfaceType(.wiredEthernet) {
                self?.connectionType = .ethernet
            } else {
                self?.connectionType = .unknown
            }
        }
        
        let queue = DispatchQueue(label: "NetworkMonitor")
        monitor.start(queue: queue)
    }
    
    func stopMonitoring() {
        monitor.cancel()
    }
}
```

## Security Considerations

1. Always use HTTPS for API communication in production
2. Never hardcode credentials in your iOS app
3. Implement proper session handling and logout functionality
4. Consider implementing app transport security settings in Info.plist
5. Be prepared for server being asleep and implement proper retry mechanisms