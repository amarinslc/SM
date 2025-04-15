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
struct MultipartDebugResponse: Codable {
    let id: Int?
    let userId: Int?
    let content: String?
    let media: [String]?
    let createdAt: String?
    let error: String?
    let message: String?
    
    enum CodingKeys: String, CodingKey {
        case id, userId, content, media, createdAt, error, message
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
                //print("🍪 Received cookies from redirect: \(cookies)")
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
    
    private let baseURL = "https://dunbarsocial.app/api"
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
            //print("🍪 Adding cookies to request: \(cookies)")
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
                //print("🔍 URL with query parameters: \(components.url?.absoluteString ?? "invalid url")")
            } else {
                do {
                    request.httpBody = try JSONSerialization.data(withJSONObject: parameters, options: [])
                } catch {
                    //("❌ JSONSerialization error: \(error)")
                    return Fail(error: NetworkError.requestFailed(error)).eraseToAnyPublisher()
                }
            }
        }
        
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .tryMap { data, response in
                // Debug logging
                // print("📲 Response received:")
                if let httpResponse = response as? HTTPURLResponse {
                    //print("🔢 Status code: \(httpResponse.statusCode)")
                    
                    // Save any cookies from the response
                    if let headerFields = httpResponse.allHeaderFields as? [String: String] {
                        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
                        if !cookies.isEmpty {
                            HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                            //print("🍪 Saved cookies from response: \(cookies)")
                        }
                    }
                    
                    // Print cookies for debugging
                    let cookiesAfter = HTTPCookieStorage.shared.cookies(for: url) ?? []
                    if !cookiesAfter.isEmpty {
                        //print("🍪 Cookies after response: \(cookiesAfter)")
                    } else {
                        //print("🍪 No cookies found after response")
                    }
                }
                
                if let responseString = String(data: data, encoding: .utf8) {
                    // print("📄 Response data: \(responseString)")
                    
                    // Check if response is HTML (indicates auth issue or error)
                    if responseString.trimmingCharacters(in: .whitespacesAndNewlines).starts(with: "<") {
                        //print("⚠️ Received HTML response instead of JSON")
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
                //print("❌ Network error: \(error.localizedDescription)")
                if let networkError = error as? NetworkError {
                    // Handle authentication issues by attempting to refresh
                    if retryForAuth && (networkError == NetworkError.unauthorized || networkError == NetworkError.htmlResponse) {
                        // print("🔄 Authentication issue detected - requesting refresh")
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
                            //print("✅ Empty response handled as success (Bool)")
                            return Just(true as! T)
                                .setFailureType(to: NetworkError.self)
                                .eraseToAnyPublisher()
                        } else if T.self == FollowResponse.self {
                            // For follow endpoints that might return empty responses
                            //print("✅ Empty response handled as success (FollowResponse)")
                            return Just(FollowResponse(success: true) as! T)
                                .setFailureType(to: NetworkError.self)
                                .eraseToAnyPublisher()
                        } else {
                            // Handle any other type that might receive empty response
                            // print("⚠️ Received empty response for type \(T.self) - attempting best effort handling")
                            // Try to create a default instance if it's a decodable type with empty initializer
                            if let decodableType = T.self as? Decodable.Type,
                               let emptyInit = decodableType as? EmptyInitializable.Type,
                               let instance = emptyInit.createEmpty() as? T {
                                return Just(instance)
                                    .setFailureType(to: NetworkError.self)
                                    .eraseToAnyPublisher()
                            }
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
                                //print("✅ Auth refreshed, retrying request")
                                return self.request(endpoint: endpoint, method: method,
                                                    parameters: parameters, retryForAuth: false)
                            } else {
                                //print("❌ Auth refresh failed")
                                return Fail(error: NetworkError.unauthorized).eraseToAnyPublisher()
                            }
                        }
                        .eraseToAnyPublisher()
                }
                return Fail(error: error).eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
    // Raw request method that returns Data and URLResponse directly
    // Removed generic parameter T since it's not used
    func requestRaw(
        endpoint: String,
        method: HTTPMethod = .get,
        parameters: [String: Any]? = nil
    ) -> AnyPublisher<(Data, URLResponse), NetworkError> {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            print("❌ Invalid URL: \(baseURL)\(endpoint)")
            return Fail(error: NetworkError.invalidURL).eraseToAnyPublisher()
        }
        
        print("📡 Making raw request to: \(url.absoluteString)")
        
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
            .mapError { error in
                return NetworkError.requestFailed(error)
            }
            .handleEvents(receiveOutput: { data, response in
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
                
                // Try to print response as text if possible
                if let responseString = String(data: data, encoding: .utf8) {
                    print("📄 Response data: \(responseString)")
                } else {
                    print("📄 Response data: (binary data)")
                }
            })
            .map { data, response -> (Data, URLResponse) in
                // This explicit mapping fixes the type inference issue
                return (data, response)
            }
            .eraseToAnyPublisher()
    }
    // Private method to refresh authentication
    private func refreshAuth() -> AnyPublisher<Bool, NetworkError> {
        print("🔐 Refreshing authentication...")
        
        // Simply try to reach the /user endpoint to refresh the session
        return self.refreshAuthIfNeeded()
            .map { success -> Bool in
                //print(success ? "✅ Authentication refreshed successfully" : "❌ Authentication refresh failed")
                return success
            }
            .setFailureType(to: NetworkError.self)
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
        method: HTTPMethod = .post,
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
        request.httpMethod = method.rawValue
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
                // Key fix: Use the same field name for all images (without array notation in name)
                // This matches how FormData works in JavaScript and what multer expects
                let filename = "image\(index).jpg"
                body.append("--\(boundary)\r\n".data(using: .utf8)!)
                // Just use the fieldName without any brackets - this is crucial
                body.append("Content-Disposition: form-data; name=\"\(imageFieldName)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
                // Detect MIME type from the data if possible
                let mimeType = detectMimeType(from: data) ?? "image/jpeg"
                body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
                body.append(data)
                body.append("\r\n".data(using: .utf8)!)
            }
        }
        
        // Close the multipart form data with boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        print("📦 Total request body size: \(body.count) bytes")
        
        
        return NetworkManager.shared.session.dataTaskPublisher(for: request)
            .mapError { error -> NetworkError in
                print("❌ Network error: \(error.localizedDescription)")
                return NetworkError.requestFailed(error)
            }
            .tryMap { data, response -> Data in
                // Enhanced response logging
                print("📲 Multipart response received:")
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                print("🔢 Status code: \(httpResponse.statusCode)")
                
                // Save cookies
                if let headerFields = httpResponse.allHeaderFields as? [String: String] {
                    let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: url)
                    if !cookies.isEmpty {
                        HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
                    }
                }
                
                // Log response body
                if let responseString = String(data: data, encoding: .utf8) {
                    print("📄 Response data: \(responseString)")
                    
                    // Try to decode as debug response for better error details
                    if httpResponse.statusCode >= 400 {
                        do {
                            let debugResponse = try JSONDecoder().decode(MultipartDebugResponse.self, from: data)
                            print("🐞 Debug decoded response: \(debugResponse)")
                            
                            if let errorMsg = debugResponse.error ?? debugResponse.message {
                                throw NetworkError.serverError(errorMsg)
                            }
                        } catch {
                            if error is NetworkError {
                                throw error
                            }
                            print("⚠️ Could not decode error response: \(error)")
                        }
                    }
                }
                
                // Handle HTTP status codes
                switch httpResponse.statusCode {
                case 200...299:
                    return data
                case 401:
                    throw NetworkError.unauthorized
                case 404:
                    throw NetworkError.notFound
                case 400...499:
                    throw NetworkError.serverError("Client error: \(httpResponse.statusCode)")
                case 500...599:
                    throw NetworkError.serverError("Server error: \(httpResponse.statusCode)")
                default:
                    throw NetworkError.unknown
                }
            }
            .flatMap { data -> AnyPublisher<T, Error> in
                // Try to print the raw JSON structure
                if let jsonObject = try? JSONSerialization.jsonObject(with: data),
                   let jsonData = try? JSONSerialization.data(withJSONObject: jsonObject, options: .prettyPrinted),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    print("📊 JSON structure: \(jsonString)")
                }
                
                // Try to decode debug response first for inspection
                if let debugResponse = try? JSONDecoder().decode(MultipartDebugResponse.self, from: data) {
                    print("🔍 Debug response successfully decoded: \(debugResponse)")
                }
                
                do {
                    // Use the default decoder with proper date strategy
                    let decoder = JSONDecoder()
                    decoder.dateDecodingStrategy = .iso8601
                    
                    let decodedObject = try decoder.decode(T.self, from: data)
                    return Just(decodedObject)
                        .setFailureType(to: Error.self)
                        .eraseToAnyPublisher()
                } catch {
                    print("❌ Decoding error for type \(T.self): \(error)")
                    
                    // More detailed decoding error analysis
                    if let decodingError = error as? DecodingError {
                        switch decodingError {
                        case .typeMismatch(let type, let context):
                            print("Type mismatch: expected \(type) at path: \(context.codingPath)")
                        case .valueNotFound(let type, let context):
                            print("Value missing: expected \(type) at path: \(context.codingPath)")
                        case .keyNotFound(let key, let context):
                            print("Key not found: \(key) at path: \(context.codingPath)")
                        case .dataCorrupted(let context):
                            print("Data corrupted at path: \(context.codingPath), debug description: \(context.debugDescription)")
                        @unknown default:
                            print("Unknown decoding error: \(error)")
                        }
                    }
                    
                    return Fail(error: NetworkError.decodingFailed(error))
                        .eraseToAnyPublisher()
                }
            }
            .mapError { error in
                if let networkError = error as? NetworkError {
                    return networkError
                }
                return NetworkError.decodingFailed(error)
            }
        .eraseToAnyPublisher()
    }
}



// MIME type detection helper
private func detectMimeType(from data: Data) -> String? {
    // Simple magic number detection for common image formats
    if data.count >= 2 {
        let bytes = [UInt8](data.prefix(4))
        
        // JPEG signature: FF D8 FF
        if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            return "image/jpeg"
        }
        
        // PNG signature: 89 50 4E 47
        if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
            return "image/png"
        }
        
        // GIF signature: 47 49 46 38
        if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x38 {
            return "image/gif"
        }
        
        // WebP signature: 52 49 46 46 and WEBP at offset 8
        if data.count >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 {
            let webpBytes = [UInt8](data[8..<12])
            if webpBytes[0] == 0x57 && webpBytes[1] == 0x45 && webpBytes[2] == 0x42 && webpBytes[3] == 0x50 {
                return "image/webp"
            }
        }
    }
    
    // Default to JPEG if unknown
    return "image/jpeg"
}

// Protocol for types that can be created with an empty initializer
protocol EmptyInitializable {
    static func createEmpty() -> Any
}

// Make FollowResponse conform to EmptyInitializable
extension FollowResponse: EmptyInitializable {
    static func createEmpty() -> Any {
        return FollowResponse(success: true)
    }
}

// Empty response struct for handling plain text or empty responses
struct EmptyResponse: Codable, EmptyInitializable {
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
    
    static func createEmpty() -> Any {
        return EmptyResponse()
    }
    
    init(success: Bool = true, message: String? = nil) {
        self.success = success
        self.message = message
    }
    
    enum CodingKeys: String, CodingKey {
        case success, message
    }
}
    

