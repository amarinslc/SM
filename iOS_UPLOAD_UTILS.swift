// Media Upload Utilities for Dunbar iOS App

import Foundation
import UIKit

class MediaUploadManager {
    static let shared = MediaUploadManager()
    
    private let baseURL: String
    private let session: URLSession
    
    private init(baseURL: String = Constants.API.baseURL) {
        self.baseURL = baseURL
        
        let config = URLSessionConfiguration.default
        config.httpShouldSetCookies = true
        config.httpCookieAcceptPolicy = .always
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.timeoutIntervalForResource = 60 // Longer timeout for uploads
        
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - Profile Photo Upload
    
    func uploadProfilePhoto(image: UIImage, completion: @escaping (Result<User, Error>) -> Void) {
        guard let url = URL(string: baseURL + "/user/profile") else {
            completion(.failure(NSError(domain: "Invalid URL", code: -1, userInfo: nil)))
            return
        }
        
        // Compress and prepare the image
        guard let imageData = image.jpegData(compressionQuality: 0.7) else {
            completion(.failure(NSError(domain: "Failed to prepare image", code: -1, userInfo: nil)))
            return
        }
        
        // Create multipart request
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add image part
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photo\"; filename=\"profile.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)
        
        // Add the closing boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        // Set the HTTP body
        request.httpBody = body
        
        // Start the request
        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NSError(domain: "Invalid response", code: -1, userInfo: nil)))
                return
            }
            
            if httpResponse.statusCode != 200 {
                // Try to extract error message
                var errorMessage = "Status code: \(httpResponse.statusCode)"
                if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = json["message"] as? String {
                    errorMessage = message
                }
                completion(.failure(NSError(domain: "Upload failed", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "No data", code: -1, userInfo: nil)))
                return
            }
            
            do {
                let user = try JSONDecoder().decode(User.self, from: data)
                completion(.success(user))
            } catch {
                completion(.failure(error))
            }
        }
        
        task.resume()
    }
    
    // MARK: - Post Media Upload
    
    struct MediaUploadResult {
        let post: Post
        let successCount: Int
        let totalCount: Int
    }
    
    func createPostWithMedia(content: String, media: [UIImage], progressHandler: ((Float) -> Void)? = nil, completion: @escaping (Result<MediaUploadResult, Error>) -> Void) {
        guard let url = URL(string: baseURL + "/posts") else {
            completion(.failure(NSError(domain: "Invalid URL", code: -1, userInfo: nil)))
            return
        }
        
        // Compress and prepare images
        var mediaDataItems: [(data: Data, filename: String, mimeType: String)] = []
        
        for (index, image) in media.enumerated() {
            guard let imageData = image.jpegData(compressionQuality: 0.7) else {
                continue
            }
            
            mediaDataItems.append((
                data: imageData,
                filename: "media_\(index).jpg",
                mimeType: "image/jpeg"
            ))
        }
        
        // If no valid media was prepared but media was provided, return error
        if mediaDataItems.isEmpty && !media.isEmpty {
            completion(.failure(NSError(domain: "Failed to prepare media", code: -1, userInfo: nil)))
            return
        }
        
        // Create multipart request
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add content part
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"content\"\r\n\r\n".data(using: .utf8)!)
        body.append(content.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)
        
        // Add media parts
        for item in mediaDataItems {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"media\"; filename=\"\(item.filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(item.mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(item.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Add the closing boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        // Set the HTTP body
        request.httpBody = body
        
        // Use URLSession's upload task for better progress tracking
        let uploadTask = session.uploadTask(with: request, from: body) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                completion(.failure(NSError(domain: "Invalid response", code: -1, userInfo: nil)))
                return
            }
            
            if httpResponse.statusCode != 201 {
                // Try to extract error message
                var errorMessage = "Status code: \(httpResponse.statusCode)"
                if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = json["message"] as? String {
                    errorMessage = message
                }
                completion(.failure(NSError(domain: "Upload failed", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])))
                return
            }
            
            guard let data = data else {
                completion(.failure(NSError(domain: "No data", code: -1, userInfo: nil)))
                return
            }
            
            do {
                let post = try JSONDecoder().decode(Post.self, from: data)
                
                // Calculate how many media items were successfully uploaded
                let successCount = post.media?.count ?? 0
                
                completion(.success(MediaUploadResult(
                    post: post,
                    successCount: successCount,
                    totalCount: media.count
                )))
            } catch {
                completion(.failure(error))
            }
        }
        
        // Track progress if handler is provided
        if let progressHandler = progressHandler {
            let observation = uploadTask.progress.observe(\.fractionCompleted) { progress, _ in
                DispatchQueue.main.async {
                    progressHandler(Float(progress.fractionCompleted))
                }
            }
            
            // Store observation somewhere if needed to prevent it from being deallocated
            // self.progressObservation = observation
        }
        
        uploadTask.resume()
    }
}

// MARK: - Helpers

extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}