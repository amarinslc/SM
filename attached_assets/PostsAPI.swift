//
//  PostsAPI.swift
//  dunbar
//
//  Created by Amarins Laanstra-Corn on 4/1/25.
//

import Foundation
import Combine

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
            return apiService.uploadMultipart(
                endpoint: "/posts",
                parameters: parameters,
                imageData: mediaData
            )
        } else {
            return apiService.request(
                endpoint: "/posts",
                method: .post,
                parameters: parameters
            )
        }
    }
    
    // Delete post
    func deletePost(postId: Int) -> AnyPublisher<Bool, NetworkError> {
        return apiService.request(endpoint: "/posts/\(postId)", method: .delete)
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
    
    // Report post
    func reportPost(postId: Int, reason: ReportReason) -> AnyPublisher<ReportResponse, NetworkError> {
        let parameters = ["reason": reason.rawValue]
        return apiService.request(
            endpoint: "/report/post/\(postId)",
            method: .post,
            parameters: parameters
        )
    }
    
    // Admin methods
    
    // Get reported posts (admin only)
    func getReportedPosts() -> AnyPublisher<ReportedPostsResponse, NetworkError> {
        return apiService.request(endpoint: "/moderation/posts")
    }
    
    // Review reported post (admin only)
    func reviewPost(postId: Int, action: ReviewAction) -> AnyPublisher<ReviewResponse, NetworkError> {
        let parameters = ["action": action.rawValue]
        return apiService.request(
            endpoint: "/moderation/review/\(postId)",
            method: .post,
            parameters: parameters
        )
    }
}

// Report reason types
enum ReportReason: String, Codable {
    case hateful = "Hateful"
    case harmfulOrAbusive = "Harmful_or_Abusive"
    case criminalActivity = "Criminal_Activity"
    case sexuallyExplicit = "Sexually_Explicit"
}

// Admin review action types
enum ReviewAction: String, Codable {
    case approve
    case remove
}

// Response models
struct ReportResponse: Codable {
    let success: Bool
    let message: String
    let postRemoved: Bool?
}

struct ReportedPostsResponse: Codable {
    let posts: [ReportedPost]
    let count: Int
    let priorityCount: Int
}

struct ReportedPost: Codable, Identifiable {
    let id: Int
    let content: String
    let user_id: Int
    let created_at: String
    let media: [String]?
    let report_count: Int
    let is_priority_review: Bool
    let is_removed: Bool
    let username: String
    let name: String
    let reports: [Report]
    
    // Helper computed properties
    var isPriority: Bool { is_priority_review }
    var isRemoved: Bool { is_removed }
    var reportCount: Int { report_count }
    var userId: Int { user_id }
    var createdAt: String { created_at }
}

struct Report: Codable {
    let reason: String
    let status: String
    let createdAt: String
    let userId: Int
}

struct ReviewResponse: Codable {
    let success: Bool
    let message: String
    let action: String
}
