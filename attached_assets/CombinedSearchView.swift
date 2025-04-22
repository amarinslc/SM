//
//  CombinedSearchView.swift
//  db
//
//  Created by Amarins Laanstra-Corn on 4/21/25.
//

import SwiftUI

struct CombinedSearchView: View {
    @StateObject private var searchViewModel = SearchViewModel()
    @StateObject private var contactViewModel = ContactViewModel()
    @State private var searchText = ""
    @State private var isSearching = false
    
    var body: some View {
        ZStack {
            // Hardcoded white background
            Color.white.ignoresSafeArea()
            
            VStack {
                // Header
                Text("Find Users")
                    .font(.title)
                    .fontWeight(.semibold)
                    .padding(.top, 20)
                
                // Search bar
                HStack {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.gray)
                        
                        TextField("Search users", text: $searchText, onEditingChanged: { editing in
                            isSearching = editing
                        })
                        .onSubmit {
                            searchViewModel.searchUsers(query: searchText)
                        }
                        
                        if !searchText.isEmpty {
                            Button(action: {
                                searchText = ""
                                searchViewModel.searchResults.removeAll()
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    .padding(8)
                    .background(Color.white)
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
                    .padding(.trailing, searchText.isEmpty ? 0 : 8)
                    
                    if !searchText.isEmpty {
                        Button("Search") {
                            searchViewModel.searchUsers(query: searchText)
                        }
                        .foregroundColor(Color("PrimaryColor"))
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)
                
                // Search results or Contacts section
                if !searchText.isEmpty {
                    // Show search results when searching
                    searchResultsView
                } else {
                    // Show contacts section when not searching
                    contactsSection
                }
            }
        }
        .onAppear {
            contactViewModel.loadContactUsers()
        }
    }
    
    // Extract search results view to a separate computed property
    private var searchResultsView: some View {
        Group {
            if searchViewModel.isLoading {
                Spacer()
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(1.5)
                Spacer()
            } else if searchViewModel.searchResults.isEmpty {
                Spacer()
                if let error = searchViewModel.error {
                    Text(error)
                        .foregroundColor(.gray)
                } else {
                    Text("No users found for '\(searchText)'")
                        .foregroundColor(.gray)
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(searchViewModel.searchResults) { user in
                            NavigationLink(destination: ProfileView(userId: user.id)) {
                                // This container acts as the card for the user.
                                HStack {
                                    // Reuse the current user row that displays profile photo, username, and name.
                                    UserRowView(user: user)
                                }
                                .padding()
                                .background(Color.white)
                                .cornerRadius(10)
                                .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                                .padding(.horizontal)
                            }
                        }
                    }
                    .padding(.vertical)
                }
            }
        }
    }
    
    // Extract contacts section to a separate computed property
    private var contactsSection: some View {
        VStack(alignment: .leading) {
            Text("Contacts on Dunbar:")
                .font(.subheadline)
                .foregroundColor(.gray)
                .padding(.horizontal)
                .padding(.top, 16)
            
            if contactViewModel.isLoading {
                Spacer()
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(1.5)
                Spacer()
            } else if !contactViewModel.contactsPermissionGranted {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "person.crop.circle.badge.questionmark")
                        .font(.system(size: 50))
                        .foregroundColor(.gray)
                    
                    Text("Contact Permission Required")
                        .font(.headline)
                    
                    Text("To find friends on Dunbar, we need access to your contacts. Your contact information is only used to match with existing users and will not be stored permanently.")
                        .multilineTextAlignment(.center)
                        .font(.callout)
                        .foregroundColor(.gray)
                        .padding(.horizontal, 24)
                    
                    Button(action: {
                        contactViewModel.loadContactUsers()
                    }) {
                        Text("Find Friends on Dunbar")
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 20)
                            .background(Color("PrimaryColor"))
                            .cornerRadius(10)
                    }
                    .padding(.top, 8)
                    Spacer()
                }
            } else if let error = contactViewModel.error {
                Spacer()
                Text(error)
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding()
                Spacer()
            } else if contactViewModel.contactUsers.isEmpty {
                Spacer()
                Text("No contacts found on Dunbar")
                    .foregroundColor(.gray)
                Spacer()
            } else {
                // Display contact users
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(contactViewModel.contactUsers) { user in
                            ContactUserRow(user: user)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
            }
            
            Spacer()
            
            if searchText.isEmpty && !isSearching {
                Text("Try searching for usernames or names")
                    .foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 20)
            }
        }
    }
}

struct ContactUserRow: View {
    let user: SimpleUser
    @State private var isFollowing = false
    @State private var isPending = false
    
    var body: some View {
        HStack {
            // User photo
            if let photoURL = user.photo, !photoURL.isEmpty {
                AsyncImage(url: URL(string: photoURL)) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color.gray.opacity(0.2)
                }
                .frame(width: 50, height: 50)
                .clipShape(Circle())
            } else {
                Image(systemName: "person.circle.fill")
                    .resizable()
                    .foregroundColor(.gray)
                    .frame(width: 50, height: 50)
            }
            
            // User info
            VStack(alignment: .leading, spacing: 4) {
                Text(user.displayName)
                    .font(.headline)
                Text("@\(user.username)")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            // Follow button
            Button(action: {
                if !isFollowing && !isPending {
                    // Call follow API
                    followUser(userId: user.id)
                }
                // Don't toggle state here - let API response drive UI
            }) {
                Text(buttonText)
                    .fontWeight(.medium)
                    .foregroundColor(buttonTextColor)
                    .padding(.vertical, 6)
                    .padding(.horizontal, 16)
                    .background(buttonBackgroundColor)
                    .cornerRadius(8)
            }
            .disabled(isFollowing || isPending)
        }
        .padding()
        .background(Color.white)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
        )
    }
    
    private var buttonText: String {
        if isFollowing {
            return "Following"
        } else if isPending {
            return "Pending"
        } else {
            return "Follow"
        }
    }
    
    private var buttonTextColor: Color {
        if isFollowing || isPending {
            return .gray
        } else {
            return .white
        }
    }
    
    private var buttonBackgroundColor: Color {
        if isFollowing || isPending {
            return Color.gray.opacity(0.2)
        } else {
            return Color("PrimaryColor")
        }
    }
    
    private func followUser(userId: Int) {
        // Show pending state right away for better UX
        isPending = true
        
        // Call API to follow user
        UserAPI.shared.followUser(userId: userId)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                if case .failure(_) = completion {
                    // Reset on failure
                    isPending = false
                }
            } receiveValue: { response in
                if response.success {
                    if response.message?.lowercased().contains("pending") == true {
                        // It's a pending request
                        isPending = true
                        isFollowing = false
                    } else {
                        // Follow successful
                        isFollowing = true
                        isPending = false
                    }
                } else {
                    // Follow failed
                    isPending = false
                }
            }
            .store(in: &UserAPI.shared.cancellables)
    }
}
