import Foundation
import Combine

// Network errors
enum NetworkError: Error {
    case invalidURL
    case invalidResponse
    case requestFailed(Error)
    case decodingFailed(Error)
    case serverError(String)
    case unauthorized
    case notFound
    case htmlResponse
    case unknown
    
    var localizedDescription: String {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid server response"
        case .requestFailed(let error):
            return "Request failed: \(error.localizedDescription)"
        case .decodingFailed(let error):
            return "Failed to decode data: \(error.localizedDescription)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .unauthorized:
            return "Authentication required. Please log in again."
        case .notFound:
            return "Resource not found"
        case .htmlResponse:
            return "Received HTML response - session may have expired"
        case .unknown:
            return "An unknown error occurred"
        }
    }
}

// Extension to make NetworkError conform to Equatable
extension NetworkError: Equatable {
    static func == (lhs: NetworkError, rhs: NetworkError) -> Bool {
        switch (lhs, rhs) {
        case (.invalidURL, .invalidURL):
            return true
        case (.invalidResponse, .invalidResponse):
            return true
        case (.unauthorized, .unauthorized):
            return true
        case (.notFound, .notFound):
            return true
        case (.unknown, .unknown):
            return true
        case (.htmlResponse, .htmlResponse):
            return true
        case (.serverError(let lhsMessage), .serverError(let rhsMessage)):
            return lhsMessage == rhsMessage
        // For cases with associated values, compare the error descriptions
        case (.requestFailed(let lhsError), .requestFailed(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
        case (.decodingFailed(let lhsError), .decodingFailed(let rhsError)):
            return lhsError.localizedDescription == rhsError.localizedDescription
        default:
            return false
        }
    }
}

// HTTP Methods
enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"  // <-- Added PATCH support
    case delete = "DELETE"
}

// Network Manager for handling URLSession and SSL/Cookie issues
class NetworkManager: NSObject, URLSessionDelegate {
    static let shared = NetworkManager()
    
    lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.default
        
        // Enhanced cookie handling
        configuration.httpShouldSetCookies = true
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        
        // Set a consistent User-Agent to help with authentication persistence
        configuration.httpAdditionalHeaders = [
            "User-Agent": "Dunbar-iOS-App/1.0",
            "Accept": "application/json"
        ]
        
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()
    
    // For allowing self-signed or invalid SSL certificates (use only for development)
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
            if let serverTrust = challenge.protectionSpace.serverTrust {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }
        completionHandler(.performDefaultHandling, nil)
    }
    
    // Additional delegate method to handle cookies
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        if let headerFields = response.allHeaderFields as? [String: String],
           let url = response.url {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
            if !cookies.isEmpty {
                HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                print("🍪 Received cookies from redirect: \(cookies)")
            }
        }
        
        // Create a new request that will include the cookies
        var newRequest = request
        
        // Explicitly add cookie header from storage
        if let url = newRequest.url {
            let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            if !cookies.isEmpty {
                let cookieHeaders = HTTPCookie.requestHeaderFields(with: cookies)
                for (field, value) in cookieHeaders {
                    newRequest.addValue(value, forHTTPHeaderField: field)
                }
            }
        }
        
        completionHandler(newRequest)
    }
}

// API Service for making network requests
class APIService {
    static let shared = APIService()
    
    private let baseURL = "https://dbsocial.replit.app/api"
    private var authRetryInProgress = false
    private var pendingRequests: [(URLRequest, (Data?, URLResponse?, Error?) -> Void)] = []
    
    private init() {}
    
    // Generic request function for JSON requests
    func request<T: Decodable>(
        endpoint: String,
        method: HTTPMethod = .get,
        parameters: [String: Any]? = nil,
        retryForAuth: Bool = true
    ) -> AnyPublisher<T, NetworkError> {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            print("❌ Invalid URL: \(baseURL)\(endpoint)")
            return Fail(error: NetworkError.invalidURL).eraseToAnyPublisher()
        }
        
        print("📡 Making request to: \(url.absoluteString)")
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        
        // Add cookie explicitly from cookie storage
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        if !cookies.isEmpty {
            print("🍪 Adding cookies to request: \(cookies)")
            let cookieHeaders = HTTPCookie.requestHeaderFields(with: cookies)
            for (field, value) in cookieHeaders {
                request.addValue(value, forHTTPHeaderField: field)
            }
        } else {
            print("⚠️ No cookies available for \(url)")
        }
        
        // Add parameters to the request
        if let parameters = parameters {
            if method == .get {
                var components = URLComponents(url: url, resolvingAgainstBaseURL: true)!
                components.queryItems = parameters.map { key, value in
                    URLQueryItem(name: key, value: "\(value)")
                }
                request.url = components.url
                print("🔍 URL with query parameters: \(components.url?.absoluteString ?? "invalid url")")
            } else {
                do {
                    request.httpBody = try JSONSerialization.data(withJSONObject: parameters, options: [])
                } catch {
                    print("❌ JSONSerialization error: \(error)")
                    return Fail(error: NetworkError.requestFailed(error)).eraseToAnyPublisher()
                }
            }
        }
        
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .tryMap { data, response in
                // Debug logging
                print("📲 Response received:")
                if let httpResponse = response as? HTTPURLResponse {
                    print("🔢 Status code: \(httpResponse.statusCode)")
                    
                    // Save any cookies from the response
                    if let headerFields = httpResponse.allHeaderFields as? [String: String] {
                        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
                        if !cookies.isEmpty {
                            HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                            print("🍪 Saved cookies from response: \(cookies)")
                        }
                    }
                    
                    // Print cookies for debugging
                    let cookiesAfter = HTTPCookieStorage.shared.cookies(for: url) ?? []
                    if !cookiesAfter.isEmpty {
                        print("🍪 Cookies after response: \(cookiesAfter)")
                    } else {
                        print("🍪 No cookies found after response")
                    }
                }
                
                if let responseString = String(data: data, encoding: .utf8) {
                    print("📄 Response data: \(responseString)")
                    
                    // Check if response is HTML (indicates auth issue or error)
                    if responseString.trimmingCharacters(in: .whitespacesAndNewlines).starts(with: "<") {
                        print("⚠️ Received HTML response instead of JSON")
                        throw NetworkError.htmlResponse
                    }
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                switch httpResponse.statusCode {
                case 200...299:
                    return data
                case 401:
                    throw NetworkError.unauthorized
                case 404:
                    throw NetworkError.notFound
                case 400...499:
                    // Try to get error message from response
                    if let errorResponse = try? JSONDecoder.defaultDecoder.decode(APIError.self, from: data) {
                        throw NetworkError.serverError(errorResponse.message)
                    }
                    throw NetworkError.serverError("Client error: \(httpResponse.statusCode)")
                case 500...599:
                    throw NetworkError.serverError("Server error: \(httpResponse.statusCode)")
                default:
                    throw NetworkError.unknown
                }
            }
            .mapError { error in
                print("❌ Network error: \(error.localizedDescription)")
                if let networkError = error as? NetworkError {
                    // Handle authentication issues by attempting to refresh
                    if retryForAuth && (networkError == NetworkError.unauthorized || networkError == NetworkError.htmlResponse) {
                        print("🔄 Authentication issue detected - requesting refresh")
                        return NetworkError.unauthorized
                    }
                    return networkError
                } else {
                    return NetworkError.requestFailed(error)
                }
            }
            .flatMap { (data: Data) -> AnyPublisher<T, NetworkError> in
                do {
                    // Special handling for empty responses
                    if data.count == 0 {
                        if Bool.self == T.self || Optional<Bool>.self == T.self {
                            // For endpoints that return nothing but success/failure
                            return Just(true as! T)
                                .setFailureType(to: NetworkError.self)
                                .eraseToAnyPublisher()
                        } else if T.self == FollowResponse.self {
                            // For follow endpoints that might return empty responses
                            return Just(FollowResponse(success: true) as! T)
                                .setFailureType(to: NetworkError.self)
                                .eraseToAnyPublisher()
                        }
                    }
                    
                    // Handle text-only responses (not JSON)
                    if let responseText = String(data: data, encoding: .utf8),
                       !responseText.starts(with: "{") && !responseText.starts(with: "[") {
                        if T.self == FollowResponse.self {
                            return Just(FollowResponse(success: true, message: responseText) as! T)
                                .setFailureType(to: NetworkError.self)
                                .eraseToAnyPublisher()
                        }
                    }
                    
                    // Standard JSON decoding
                    let decodedData = try JSONDecoder.defaultDecoder.decode(T.self, from: data)
                    return Just(decodedData)
                        .setFailureType(to: NetworkError.self)
                        .eraseToAnyPublisher()
                } catch {
                    print("❌ Decoding error: \(error)")
                    
                    // For small text responses that aren't JSON but we still want to accept
                    if let responseText = String(data: data, encoding: .utf8),
                       data.count < 200 && !responseText.starts(with: "<") &&
                        (T.self == FollowResponse.self) {
                        return Just(FollowResponse(success: true, message: responseText) as! T)
                            .setFailureType(to: NetworkError.self)
                            .eraseToAnyPublisher()
                    }
                    
                    return Fail(error: NetworkError.decodingFailed(error)).eraseToAnyPublisher()
                }
            }
            .catch { (error: NetworkError) -> AnyPublisher<T, NetworkError> in
                // If authentication failed, try to refresh and retry
                if retryForAuth && (error == NetworkError.unauthorized || error == NetworkError.htmlResponse) {
                    print("🔄 Attempting to refresh authentication")
                    return self.refreshAuth()
                        .flatMap { success -> AnyPublisher<T, NetworkError> in
                            if success {
                                print("✅ Auth refreshed, retrying request")
                                return self.request(endpoint: endpoint, method: method,
                                                    parameters: parameters, retryForAuth: false)
                            } else {
                                print("❌ Auth refresh failed")
                                return Fail(error: NetworkError.unauthorized).eraseToAnyPublisher()
                            }
                        }
                        .eraseToAnyPublisher()
                }
                return Fail(error: error).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
    
    // Private method to refresh authentication
    private func refreshAuth() -> AnyPublisher<Bool, NetworkError> {
        print("🔐 Refreshing authentication...")
        
        // First make sure server is awake
        return wakeUpServer()
            .flatMap { success -> AnyPublisher<Bool, NetworkError> in
                if !success {
                    return Just(false)
                        .setFailureType(to: NetworkError.self)
                        .eraseToAnyPublisher()
                }
                
                // Then try to reach the /user endpoint to refresh the session
                return self.refreshAuthIfNeeded()
                    .map { success -> Bool in
                        print(success ? "✅ Authentication refreshed successfully" : "❌ Authentication refresh failed")
                        return success
                    }
                    .setFailureType(to: NetworkError.self)
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
    
    // Wake up the Replit server
    func wakeUpServer() -> AnyPublisher<Bool, Never> {
        guard let url = URL(string: "\(baseURL)/storage/health") else {
            return Just(false).eraseToAnyPublisher()
        }
        
        print("🚀 Waking up server...")
        
        let request = URLRequest(url: url)
        
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .tryMap { data, response -> Bool in
                guard let httpResponse = response as? HTTPURLResponse else {
                    return false
                }
                
                if httpResponse.statusCode == 200 {
                    print("✅ Server is awake")
                    return true
                } else {
                    print("❌ Server returned status: \(httpResponse.statusCode)")
                    return false
                }
            }
            .replaceError(with: false)
            .eraseToAnyPublisher()
    }
    
    // Enhanced wake up server function with multiple retries
    func wakeUpServerEnhanced(maxRetries: Int = 3) -> AnyPublisher<Bool, Never> {
        return wakeUpServerWithRetry(currentRetry: 0, maxRetries: maxRetries)
    }
    
    private func wakeUpServerWithRetry(currentRetry: Int, maxRetries: Int) -> AnyPublisher<Bool, Never> {
        print("🚀 Waking up server (attempt \(currentRetry + 1) of \(maxRetries))...")
        
        return wakeUpServer()
            .flatMap { success -> AnyPublisher<Bool, Never> in
                if success {
                    print("✅ Server is now awake")
                    return Just(true).eraseToAnyPublisher()
                } else if currentRetry < maxRetries - 1 {
                    print("⚠️ Server wake-up attempt \(currentRetry + 1) failed, retrying...")
                    // Exponential backoff: wait longer for each retry
                    let delay = TimeInterval(pow(2.0, Double(currentRetry)))
                    return Just(false)
                        .delay(for: .seconds(delay), scheduler: DispatchQueue.main)
                        .flatMap { _ in
                            self.wakeUpServerWithRetry(currentRetry: currentRetry + 1, maxRetries: maxRetries)
                        }
                        .eraseToAnyPublisher()
                } else {
                    print("❌ Server wake-up failed after \(maxRetries) attempts")
                    return Just(false).eraseToAnyPublisher()
                }
            }
            .eraseToAnyPublisher()
    }
    
    // Function to check authentication status and refresh if needed
    func refreshAuthIfNeeded() -> AnyPublisher<Bool, Never> {
        guard let url = URL(string: "\(baseURL)/user") else {
            return Just(false).eraseToAnyPublisher()
        }
        
        print("🔄 Checking authentication status...")
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        
        // Add cookie explicitly from cookie storage
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        if !cookies.isEmpty {
            let cookieHeaders = HTTPCookie.requestHeaderFields(with: cookies)
            for (field, value) in cookieHeaders {
                request.addValue(value, forHTTPHeaderField: field)
            }
        }
        
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .tryMap { data, response -> Bool in
                guard let httpResponse = response as? HTTPURLResponse else {
                    return false
                }
                
                // Save any cookies from the response
                if let headerFields = httpResponse.allHeaderFields as? [String: String] {
                    let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
                    if !cookies.isEmpty {
                        HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                    }
                }
                
                // Check if response is HTML (indicates auth issue)
                if let responseString = String(data: data, encoding: .utf8),
                   responseString.trimmingCharacters(in: .whitespacesAndNewlines).starts(with: "<") {
                    return false
                }
                
                return httpResponse.statusCode == 200
            }
            .replaceError(with: false)
            .eraseToAnyPublisher()
    }
    
    // Function for multipart/form-data requests (for file uploads)
    func uploadMultipart<T: Decodable>(
        endpoint: String,
        method: HTTPMethod = .post,  // Add this parameter
        parameters: [String: Any],
        imageData: [Data]? = nil,
        imageFieldName: String = "media"
    ) -> AnyPublisher<T, NetworkError> {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            return Fail(error: NetworkError.invalidURL).eraseToAnyPublisher()
        }
        
        print("📡 Making multipart request to: \(url.absoluteString)")
        
        // Generate boundary string
        let boundary = "Boundary-\(UUID().uuidString)"
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue     // Use the provided method (can be PATCH)
        request.setValue("multipart/form-data; boundary=\(boundary)",
                         forHTTPHeaderField: "Content-Type")
        
        let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
        if !cookies.isEmpty {
            print("🍪 Adding cookies to multipart request: \(cookies)")
            let cookieHeaders = HTTPCookie.requestHeaderFields(with: cookies)
            for (field, value) in cookieHeaders {
                request.addValue(value, forHTTPHeaderField: field)
            }
        }
        
        var body = Data()
        
        // Append text parameters
        for (key, value) in parameters {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        // Append image data if provided
        if let imageData = imageData {
            for (index, data) in imageData.enumerated() {
                let filename = "image\(index).jpg"
                body.append("--\(boundary)\r\n".data(using: .utf8)!)
                body.append("Content-Disposition: form-data; name=\"\(imageFieldName)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
                body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
                body.append(data)
                body.append("\r\n".data(using: .utf8)!)
            }
        }
        
        // Close the multipart form data with boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        // Continue with the existing upload logic...
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .tryMap { data, response in
                print("📲 Multipart response received:")
                if let httpResponse = response as? HTTPURLResponse {
                    print("🔢 Status code: \(httpResponse.statusCode)")
                    if let headerFields = httpResponse.allHeaderFields as? [String: String] {
                        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
                        if !cookies.isEmpty {
                            HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                            print("🍪 Saved cookies from multipart response: \(cookies)")
                        }
                    }
                }
                
                if let responseString = String(data: data, encoding: .utf8) {
                    let trimmedResponse = responseString.trimmingCharacters(in: .whitespacesAndNewlines)
                    if trimmedResponse.starts(with: "<") {
                        print("⚠️ Received HTML response instead of JSON")
                        throw NetworkError.htmlResponse
                    }
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                switch httpResponse.statusCode {
                case 200...299:
                    return data
                case 401:
                    throw NetworkError.unauthorized
                case 404:
                    throw NetworkError.notFound
                case 400...499:
                    if let errorResponse = try? JSONDecoder.defaultDecoder.decode(APIError.self, from: data) {
                        throw NetworkError.serverError(errorResponse.message)
                    }
                    throw NetworkError.serverError("Client error: \(httpResponse.statusCode)")
                case 500...599:
                    throw NetworkError.serverError("Server error: \(httpResponse.statusCode)")
                default:
                    throw NetworkError.unknown
                }
            }
            .tryMap { data in
                return try JSONDecoder.defaultDecoder.decode(T.self, from: data)
            }
            .mapError { error in
                return NetworkError.decodingFailed(error)
            }
            .eraseToAnyPublisher()
    }
}
    

    
    // Empty response struct for handling plain text or empty responses
struct EmptyResponse: Codable {
    var success: Bool = true
    var message: String?
    
    init() {
        self.success = true
        self.message = nil
    }
    
    init(message: String) {
        self.success = true
        self.message = message
    }
    
    init(success: Bool = true, message: String? = nil) {
        self.success = success
        self.message = message
    }
    
    enum CodingKeys: String, CodingKey {
        case success, message
    }
}
    

