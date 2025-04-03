// Models for Dunbar iOS App
// These models match the API responses from the backend

import Foundation

// MARK: - User Models

struct User: Codable, Identifiable, Equatable {
    let id: Int
    let username: String
    let email: String?
    let bio: String?
    let photo: String?
    let isAdmin: Bool
    let createdAt: Date
    let isPrivate: Bool
    let displayName: String?
    
    static func == (lhs: User, rhs: User) -> Bool {
        return lhs.id == rhs.id
    }
}

struct UserProfile: Codable {
    let user: ProfileUser
    let isFollowing: Bool
    let isPending: Bool
}

struct ProfileUser: Codable, Identifiable {
    let id: Int
    let username: String
    let displayName: String?
    let bio: String?
    let photo: String?
    let isPrivate: Bool
    let createdAt: Date
}

// MARK: - Post Models

struct Post: Codable, Identifiable {
    let id: Int
    let content: String
    let media: [String]?
    let userId: Int
    let createdAt: Date
    let user: PostUser
    var comments: [Comment]?
    
    // Helper to determine if post shows relative or absolute time
    var isWithin24Hours: Bool {
        let calendar = Calendar.current
        let now = Date()
        let components = calendar.dateComponents([.hour], from: createdAt, to: now)
        return (components.hour ?? 0) < 24
    }
    
    // Format date for display
    var formattedDate: String {
        if isWithin24Hours {
            // Relative time for posts within 24 hours
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .short
            return formatter.localizedString(for: createdAt, relativeTo: Date())
        } else {
            // Absolute date for older posts
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: createdAt)
        }
    }
}

struct PostUser: Codable, Identifiable {
    let id: Int
    let username: String
    let displayName: String?
    let photo: String?
}

// MARK: - Comment Models

struct Comment: Codable, Identifiable {
    let id: Int
    let content: String
    let postId: Int
    let userId: Int
    let createdAt: Date
    let user: CommentUser
    
    // Format date for display
    var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }
}

struct CommentUser: Codable, Identifiable {
    let id: Int
    let username: String
    let displayName: String?
    let photo: String?
}

// MARK: - Follow Request Models

struct FollowRequest: Codable, Identifiable {
    let id: Int
    let createdAt: Date
    let follower: FollowRequestUser?
    let following: FollowRequestUser?
    
    // Format date for display
    var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }
}

struct FollowRequestUser: Codable, Identifiable {
    let id: Int
    let username: String
    let displayName: String?
    let photo: String?
}

// MARK: - Authentication Models

struct AuthResponse: Codable {
    let user: User
    let isFollowing: Bool
    let isPending: Bool
    let message: String?
}

struct LoginCredentials: Codable {
    let username: String
    let password: String
}

struct RegisterCredentials: Codable {
    let username: String
    let email: String
    let password: String
    let displayName: String
}

// MARK: - Request/Response Models

struct ProfileUpdateRequest: Codable {
    var displayName: String?
    var bio: String?
    var isPrivate: Bool?
}

struct CreatePostRequest: Codable {
    let content: String
}

struct CreateCommentRequest: Codable {
    let content: String
}

struct ErrorResponse: Codable {
    let error: String
    let message: String?
}

// MARK: - Extensions

extension Date {
    // Format for displaying in the UI
    var displayFormat: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }
    
    // Check if date is today
    var isToday: Bool {
        return Calendar.current.isDateInToday(self)
    }
    
    // Check if date is yesterday
    var isYesterday: Bool {
        return Calendar.current.isDateInYesterday(self)
    }
    
    // Format for social media style display
    var socialFormat: String {
        if isToday {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return formatter.string(from: self)
        } else if isYesterday {
            return "Yesterday"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "MMM d"
            return formatter.string(from: self)
        }
    }
}