// CombinedSearchView.swift
//  db
//
//  Created by Amarins Laanstra-Corn on 4/21/25.
//

import SwiftUI
import Combine

struct CombinedSearchView: View {
    @StateObject private var searchViewModel = SearchViewModel()
    @StateObject private var contactViewModel = ContactViewModel()
    @EnvironmentObject var authManager: AuthManager

    @State private var searchText = ""
    @State private var isSearching = false
    @State private var showPhoneNumberPopup = false

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()

            VStack {
                Text("Find Friends")
                    .font(.title).fontWeight(.semibold)
                    .padding(.top, 20)
                    .foregroundColor(Color("PrimaryColor"))

                // Search bar
                HStack {
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundColor(.gray)
                        TextField("Search users", text: $searchText, onEditingChanged: { editing in
                            isSearching = editing
                        })
                        .onSubmit { searchViewModel.searchUsers(query: searchText) }
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
                                searchViewModel.searchResults.removeAll()
                            } label: {
                                Image(systemName: "xmark.circle.fill").foregroundColor(.gray)
                            }
                        }
                    }
                    .padding(8)
                    .background(Color.white)
                    .cornerRadius(10)
                    .overlay(RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.gray.opacity(0.3), lineWidth: 1))
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

                // Content
                if !searchText.isEmpty {
                    searchResultsView
                } else {
                    contactsSection
                }
            }
        }
        .onAppear {
            // If user already has a phone, load contacts; otherwise show popup
            if let phone = authManager.currentUser?.phoneNumber, !phone.isEmpty {
                contactViewModel.loadContactUsers()
            } else {
                showPhoneNumberPopup = true
            }
        }
        .sheet(isPresented: $showPhoneNumberPopup, onDismiss: {
            if let phone = authManager.currentUser?.phoneNumber, !phone.isEmpty {
                contactViewModel.loadContactUsers()
            }
        }) {
            PhoneNumberPopup()
                .environmentObject(authManager)
        }
    }

    private var searchResultsView: some View {
        Group {
            if searchViewModel.isLoading {
                Spacer()
                ProgressView().scaleEffect(1.5)
                Spacer()
            } else if searchViewModel.searchResults.isEmpty {
                Spacer()
                if let error = searchViewModel.error {
                    Text(error).foregroundColor(.gray)
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
                                UserRowView(user: user)
                                    .padding()
                                    .background(Color.white)
                                    .cornerRadius(10)
                                    .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)
                                    .padding(.horizontal)
                            }
                        }
                    }
                    .padding(.vertical)
                }
            }
        }
    }

    private var contactsSection: some View {
        VStack(alignment: .leading) {
            Text("Contacts on Dunbar:")
                .font(.subheadline).foregroundColor(.gray)
                .padding(.horizontal).padding(.top, 16)

            if contactViewModel.isLoading {
                Spacer()
                ProgressView().scaleEffect(1.5)
                Spacer()
            } else if !contactViewModel.contactsPermissionGranted {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "person.crop.circle.badge.questionmark")
                        .font(.system(size: 50)).foregroundColor(.gray)
                    Text("Contact Permission Required").font(.headline)
                    Text("To find friends on Dunbar, we need access to your contacts. Your contact information is only used to match with existing users and will not be stored permanently.")
                        .multilineTextAlignment(.center)
                        .font(.callout).foregroundColor(.gray)
                        .padding(.horizontal, 24)
                    Button(action: {
                        if canSearchContacts() {
                            contactViewModel.loadContactUsers()
                        }
                    }) {
                        Text("Find Friends on Dunbar")
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                            .padding(.vertical, 10).padding(.horizontal, 20)
                            .background(Color("PrimaryColor")).cornerRadius(10)
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
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(contactViewModel.contactUsers) { user in
                            ContactUserRow(user: user)
                        }
                    }
                    .padding(.horizontal).padding(.vertical, 8)
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

    private func canSearchContacts() -> Bool {
        guard let phone = authManager.currentUser?.phoneNumber, !phone.isEmpty else {
            showPhoneNumberPopup = true
            return false
        }
        return true
    }
}

// Re-add ContactUserRow so the view compiles
struct ContactUserRow: View {
    let user: SimpleUser
    @State private var isFollowing = false
    @State private var isPending = false
    @StateObject private var viewModel = ProfileViewModel()

    var body: some View {
        NavigationLink(destination: ProfileView(userId: user.id)) {
            HStack {
                if let url = user.photo, let imageURL = URL(string: url), !url.isEmpty {
                    AsyncImage(url: imageURL) { img in
                        img.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Color.gray.opacity(0.2)
                    }
                    .frame(width: 50, height: 50).clipShape(Circle())
                } else {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                        .foregroundColor(.gray)
                        .frame(width: 50, height: 50)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName).font(.headline).foregroundColor(.black)
                    Text("@\(user.username)").font(.subheadline).foregroundColor(.gray)
                }

                Spacer()

                Button(action: followAction) {
                    Text(buttonText)
                        .fontWeight(.medium)
                        .foregroundColor(buttonTextColor)
                        .padding(.vertical, 6).padding(.horizontal, 16)
                        .background(buttonBackgroundColor).cornerRadius(8)
                }
                .disabled(isFollowing || isPending)
            }
            .padding()
            .background(Color.white)
            .cornerRadius(10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(PlainButtonStyle())
        .onAppear(perform: checkFollowStatus)
    }

    private var buttonText: String {
        isFollowing ? "Following" : (isPending ? "Pending" : "Follow")
    }
    private var buttonTextColor: Color {
        (isFollowing || isPending) ? .gray : .white
    }
    private var buttonBackgroundColor: Color {
        (isFollowing || isPending) ? Color.gray.opacity(0.2) : Color("PrimaryColor")
    }

    private func checkFollowStatus() {
        UserAPI.shared.getUserProfile(userId: user.id)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { resp in
                self.isFollowing = resp.isFollowing
                self.isPending   = resp.isPending
            })
            .store(in: &viewModel.cancellables)
        viewModel.fetchOutgoingRequests()
    }

    private func followAction() {
        isPending = true
        UserAPI.shared.followUser(userId: user.id)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { comp in
                if case .failure = comp { isPending = false }
            }, receiveValue: { resp in
                if resp.success {
                    let msg = resp.message?.lowercased() ?? ""
                    self.isPending   = msg.contains("pending")
                    self.isFollowing = !msg.contains("pending")
                } else {
                    self.isPending = false
                }
            })
            .store(in: &viewModel.cancellables)
    }
}
