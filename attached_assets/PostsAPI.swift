//
//  PostsAPI.swift
//  dunbar
//
//  Created by Amarins Laanstra-Corn on 4/1/25.
//

import Foundation
import Combine
import UIKit

// Posts API for post-related requests
class PostsAPI {
    static let shared = PostsAPI()
    
    private let apiService = APIService.shared
    private var failedEndpoints = Set<String>()
    
    // Get feed
    func getFeed() -> AnyPublisher<[FeedPost], NetworkError> {
        return apiService.request(endpoint: "/feed")
    }
    
    // Get user posts with fallback support for multiple endpoint formats
    func getUserPosts(userId: Int) -> AnyPublisher<[ProfilePost], NetworkError> {
        // Try endpoints in sequence until one succeeds
        return tryMultipleEndpoints(userId: userId)
    }
    
    // Helper to try multiple endpoints for fetching user posts
    private func tryMultipleEndpoints(userId: Int) -> AnyPublisher<[ProfilePost], NetworkError> {
        // Define the endpoints to try, in order of preference
        let endpoints = [
            "/users/\(userId)/posts",   // Preferred endpoint (documented)
            "/posts?userId=\(userId)",  // Query parameter approach
            "/posts/\(userId)"          // Path parameter approach
        ]
        
        // Filter out endpoints that have already failed
        let availableEndpoints = endpoints.filter { !failedEndpoints.contains($0) }
        
        // If all endpoints have failed, return a failure
        if availableEndpoints.isEmpty {
            return Fail(error: NetworkError.notFound).eraseToAnyPublisher()
        }
        
        // Try the first available endpoint
        let endpoint = availableEndpoints[0]
        print("🔍 Trying user posts endpoint: \(endpoint)")
        
        return apiService.request(endpoint: endpoint)
            .catch { [weak self] error -> AnyPublisher<[ProfilePost], NetworkError> in
                // If this endpoint fails, add it to the failed list and try the next one
                self?.failedEndpoints.insert(endpoint)
                print("❌ Endpoint \(endpoint) failed: \(error.localizedDescription)")
                return self?.tryMultipleEndpoints(userId: userId) ?? Fail(error: error).eraseToAnyPublisher()
            }
            .handleEvents(receiveOutput: { [weak self] _ in
                // Clear failed endpoints on success to allow retrying in the future
                self?.failedEndpoints.removeAll()
                print("✅ Successfully fetched posts using endpoint: \(endpoint)")
            })
            .eraseToAnyPublisher()
    }
    
    // Reset failed endpoints - call this when session changes or app restarts
    func resetFailedEndpoints() {
        failedEndpoints.removeAll()
    }
    
    // Create post
    func createPost(content: String, mediaData: [Data]? = nil) -> AnyPublisher<PostCreationResponse, NetworkError> {
        let parameters: [String: Any] = ["content": content]

        if let mediaData = mediaData, !mediaData.isEmpty {
            let processedMediaData = mediaData.compactMap { data -> Data? in
                if data.count > 5_000_000, let image = UIImage(data: data) {
                    return image.jpegData(compressionQuality: 0.4)
                } else if data.count > 2_000_000, let image = UIImage(data: data) {
                    return image.jpegData(compressionQuality: 0.6)
                } else if let image = UIImage(data: data) {
                    return image.jpegData(compressionQuality: 0.8)
                }
                return data
            }
            
            return apiService.uploadMultipart(
                endpoint: "/posts",  
                parameters: parameters,
                imageData: processedMediaData,
                imageFieldName: "media"
            )
        } else {
            return apiService.request(
                endpoint: "/posts",
                method: .post,
                parameters: parameters
            )
        }
    }

    
    // Delete post - Handle plain text "OK" response
    func deletePost(postId: Int) -> AnyPublisher<Bool, NetworkError> {
        return apiService.requestRaw(endpoint: "/posts/\(postId)", method: .delete)
            .map { data, response in
                // Check HTTP status code for success (200-299 range)
                if let httpResponse = response as? HTTPURLResponse,
                   (200...299).contains(httpResponse.statusCode) {
                    // If we got a valid HTTP success response, consider it successful
                    // regardless of the actual body content
                    print("✅ Post deletion successful with status code: \(httpResponse.statusCode)")
                    return true
                } else {
                    // Try to decode the response or assume failure
                    print("⚠️ Post deletion response outside of success range")
                    return false
                }
            }
            .eraseToAnyPublisher()
    }
    
    // Get comments
    func getComments(postId: Int) -> AnyPublisher<[Comment], NetworkError> {
        return apiService.request(endpoint: "/posts/\(postId)/comments")
    }
    
    // Add comment
    func addComment(postId: Int, content: String) -> AnyPublisher<Comment, NetworkError> {
        let parameters = ["content": content]
        return apiService.request(
            endpoint: "/posts/\(postId)/comments",
            method: .post,
            parameters: parameters
        )
    }
    
    // Delete comment
    func deleteComment(commentId: Int) -> AnyPublisher<Bool, NetworkError> {
        return apiService.request(endpoint: "/comments/\(commentId)", method: .delete)
    }
}
