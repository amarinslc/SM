//
//  ModerationViewModel.swift
//  dunbar
//
//  Created by DunbarApp Team on 4/15/25.
//

import Foundation
import Combine

class ModerationViewModel: ObservableObject {
    private let postsAPI = PostsAPI.shared
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Published Properties
    @Published var reportedPosts: [ReportedPost] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var successMessage: String?
    @Published var reportSubmitted = false
    @Published var priorityPostCount = 0
    
    // MARK: - Reporting Functions
    
    /// Report a post for violation of community guidelines
    /// - Parameters:
    ///   - postId: ID of the post to report
    ///   - reason: Type of violation (hateful, harmful, etc.)
    func reportPost(postId: Int, reason: ReportReason) {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        reportSubmitted = false
        
        postsAPI.reportPost(postId: postId, reason: reason)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                
                if case .failure(let error) = completion {
                    self?.errorMessage = "Failed to report post: \(error.localizedDescription)"
                }
            }, receiveValue: { [weak self] response in
                self?.successMessage = response.message
                self?.reportSubmitted = response.success
                
                if let postRemoved = response.postRemoved, postRemoved {
                    self?.successMessage = "Post reported successfully and has been automatically hidden due to multiple reports."
                }
            })
            .store(in: &cancellables)
    }
    
    // MARK: - Admin Moderation Functions
    
    /// Fetch all reported posts (admin only)
    func fetchReportedPosts() {
        isLoading = true
        errorMessage = nil
        
        postsAPI.getReportedPosts()
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                
                if case .failure(let error) = completion {
                    self?.errorMessage = "Failed to fetch reported posts: \(error.localizedDescription)"
                }
            }, receiveValue: { [weak self] response in
                self?.reportedPosts = response.posts
                self?.priorityPostCount = response.priorityCount
            })
            .store(in: &cancellables)
    }
    
    /// Review a reported post (approve or remove)
    /// - Parameters:
    ///   - postId: ID of the post to review
    ///   - action: Approve (keep post) or Remove (delete post)
    func reviewPost(postId: Int, action: ReviewAction) {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        
        postsAPI.reviewPost(postId: postId, action: action)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                
                if case .failure(let error) = completion {
                    self?.errorMessage = "Failed to process review: \(error.localizedDescription)"
                }
            }, receiveValue: { [weak self] response in
                self?.successMessage = response.message
                
                // Remove post from local list
                if response.success {
                    self?.reportedPosts.removeAll { $0.id == postId }
                    
                    // Refresh the list to get updated counts
                    self?.fetchReportedPosts()
                }
            })
            .store(in: &cancellables)
    }
    
    /// Check if the user has admin review access
    /// This depends on the API correctly checking admin access
    func checkAdminAccess() -> AnyPublisher<Bool, Never> {
        return postsAPI.getReportedPosts()
            .map { _ in true } // Success means we have access
            .catch { _ in Just(false) } // Failure means no access
            .eraseToAnyPublisher()
    }
    
    // Helper to get filtered posts
    var priorityPosts: [ReportedPost] {
        reportedPosts.filter { $0.isPriority }
    }
    
    var regularPosts: [ReportedPost] {
        reportedPosts.filter { !$0.isPriority }
    }
}

// MARK: - Example Usage for SwiftUI Views

/*
 
 // Post Report Sheet
 struct ReportPostSheet: View {
     @ObservedObject var viewModel: ModerationViewModel
     @Binding var isShowing: Bool
     let postId: Int
     
     @State private var selectedReason: ReportReason = .hateful
     
     var body: some View {
         NavigationView {
             Form {
                 Section(header: Text("Select a reason for reporting")) {
                     Picker("Reason", selection: $selectedReason) {
                         Text("Hateful Content").tag(ReportReason.hateful)
                         Text("Harmful or Abusive").tag(ReportReason.harmfulOrAbusive)
                         Text("Criminal Activity").tag(ReportReason.criminalActivity)
                         Text("Sexually Explicit").tag(ReportReason.sexuallyExplicit)
                     }
                     .pickerStyle(MenuPickerStyle())
                 }
                 
                 Section {
                     Button(action: {
                         viewModel.reportPost(postId: postId, reason: selectedReason)
                     }) {
                         Text("Submit Report")
                     }
                     .disabled(viewModel.isLoading)
                 }
                 
                 if viewModel.isLoading {
                     HStack {
                         Spacer()
                         ProgressView()
                         Spacer()
                     }
                 }
                 
                 if let error = viewModel.errorMessage {
                     Section {
                         Text(error)
                             .foregroundColor(.red)
                     }
                 }
                 
                 if viewModel.reportSubmitted {
                     Section {
                         Text(viewModel.successMessage ?? "Report submitted successfully")
                             .foregroundColor(.green)
                         
                         Button("Close") {
                             isShowing = false
                         }
                     }
                 }
             }
             .navigationTitle("Report Post")
             .toolbar {
                 ToolbarItem(placement: .navigationBarLeading) {
                     Button("Cancel") {
                         isShowing = false
                     }
                 }
             }
         }
     }
 }
 
 // Admin Moderation View
 struct ModerationView: View {
     @StateObject var viewModel = ModerationViewModel()
     
     var body: some View {
         NavigationView {
             List {
                 // Priority section for posts with 3+ reports
                 if !viewModel.priorityPosts.isEmpty {
                     Section(header: Text("Priority Review (\(viewModel.priorityPosts.count))").foregroundColor(.red)) {
                         ForEach(viewModel.priorityPosts) { post in
                             reportedPostRow(post: post)
                         }
                     }
                 }
                 
                 // Regular reported posts
                 if !viewModel.regularPosts.isEmpty {
                     Section(header: Text("Reported Posts (\(viewModel.regularPosts.count))")) {
                         ForEach(viewModel.regularPosts) { post in
                             reportedPostRow(post: post)
                         }
                     }
                 }
                 
                 if viewModel.reportedPosts.isEmpty && !viewModel.isLoading {
                     Text("No reported posts to review")
                         .foregroundColor(.gray)
                         .frame(maxWidth: .infinity, alignment: .center)
                         .padding()
                 }
             }
             .navigationTitle("Content Moderation")
             .toolbar {
                 ToolbarItem(placement: .navigationBarTrailing) {
                     Button(action: {
                         viewModel.fetchReportedPosts()
                     }) {
                         Image(systemName: "arrow.clockwise")
                     }
                 }
             }
             .overlay(
                 Group {
                     if viewModel.isLoading {
                         ProgressView()
                             .scaleEffect(1.5)
                             .frame(maxWidth: .infinity, maxHeight: .infinity)
                             .background(Color.black.opacity(0.05))
                     }
                 }
             )
             .alert(item: Binding<ReportAlert?>(
                 get: { viewModel.errorMessage != nil ? ReportAlert(message: viewModel.errorMessage!) : nil },
                 set: { _ in viewModel.errorMessage = nil }
             )) { alert in
                 Alert(title: Text("Error"), message: Text(alert.message), dismissButton: .default(Text("OK")))
             }
             .onAppear {
                 viewModel.fetchReportedPosts()
             }
         }
     }
     
     private func reportedPostRow(post: ReportedPost) -> some View {
         VStack(alignment: .leading) {
             HStack {
                 VStack(alignment: .leading) {
                     Text(post.name)
                         .font(.headline)
                     Text("@\(post.username)")
                         .font(.subheadline)
                         .foregroundColor(.gray)
                 }
                 
                 Spacer()
                 
                 Text("\(post.reportCount) reports")
                     .font(.caption)
                     .padding(4)
                     .background(post.isPriority ? Color.red.opacity(0.2) : Color.orange.opacity(0.2))
                     .cornerRadius(4)
             }
             
             Text(post.content)
                 .padding(.vertical, 4)
                 .lineLimit(3)
             
             HStack {
                 Button(action: {
                     viewModel.reviewPost(postId: post.id, action: .approve)
                 }) {
                     Text("Approve")
                         .padding(.horizontal, 12)
                         .padding(.vertical, 6)
                         .background(Color.green.opacity(0.8))
                         .foregroundColor(.white)
                         .cornerRadius(8)
                 }
                 
                 Button(action: {
                     viewModel.reviewPost(postId: post.id, action: .remove)
                 }) {
                     Text("Remove")
                         .padding(.horizontal, 12)
                         .padding(.vertical, 6)
                         .background(Color.red.opacity(0.8))
                         .foregroundColor(.white)
                         .cornerRadius(8)
                 }
                 
                 Spacer()
                 
                 // Format date nicely
                 Text(post.createdAt.prefix(10))
                     .font(.caption)
                     .foregroundColor(.gray)
             }
             
             // Show report details
             ForEach(post.reports, id: \.userId) { report in
                 HStack {
                     Text("Reason: \(report.reason)")
                         .font(.caption)
                     Spacer()
                     Text("Status: \(report.status)")
                         .font(.caption)
                 }
                 .padding(.vertical, 2)
                 .padding(.horizontal, 4)
                 .background(Color.gray.opacity(0.1))
                 .cornerRadius(4)
             }
         }
         .padding(.vertical, 8)
     }
 }

 struct ReportAlert: Identifiable {
     var id: String { message }
     let message: String
 }
 
 */