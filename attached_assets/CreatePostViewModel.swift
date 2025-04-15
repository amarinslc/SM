//
//  CreatePostView.swift
//  dunbar
//
//  Created by Amarins Laanstra-Corn on 4/1/25.
//

import Foundation
import Combine

import SwiftUI

// Create Post View Model
class CreatePostViewModel: ObservableObject {
    @Published var content: String = ""
    @Published var mediaItems: [UIImage] = []
    @Published var isLoading = false
    @Published var error: String?
    
    private var cancellables = Set<AnyCancellable>()
    
    // Create post
    // Create post
    func createPost(completion: @escaping (Post?) -> Void) {
        guard !content.isEmpty || !mediaItems.isEmpty else {
            error = "Post must have text or media"
            return
        }
        
        isLoading = true
        error = nil
        
        // Convert images to data
        var mediaData: [Data]? = nil
        if !mediaItems.isEmpty {
            mediaData = mediaItems.compactMap { $0.jpegData(compressionQuality: 0.7) }
        }
        
        // Use PostCreationResponse instead of Post
        PostsAPI.shared.createPost(content: content, mediaData: mediaData)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                guard let self = self else { return }
                self.isLoading = false
                
                switch result {
                case .finished:
                    break
                case .failure(let error):
                    self.error = error.localizedDescription
                    completion(nil)
                }
            } receiveValue: { [weak self] postResponse in
                guard let self = self,
                      let currentUser = AuthManager.shared.currentUser else {
                    completion(nil)
                    return
                }
                
                // Convert the response to a Post
                let post = postResponse.toPost(currentUser: currentUser)
                completion(post)
            }
            .store(in: &cancellables)
    }
    
    // Add media item
    func addMediaItem(_ image: UIImage) {
        mediaItems.append(image)
    }
    
    // Remove media item
    func removeMediaItem(at index: Int) {
        guard index >= 0 && index < mediaItems.count else { return }
        mediaItems.remove(at: index)
    }
    
    // Clear form
    func clearForm() {
        content = ""
        mediaItems = []
        error = nil
    }
}
