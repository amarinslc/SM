// PhoneNumberPopUP.swift
//  db
//
//  Created by Amarins Laanstra-Corn on 4/22/25.
//

import SwiftUI
import Combine

struct PhoneNumberPopup: View {
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject var authManager: AuthManager

    @State private var phoneNumber = ""
    @State private var isLoading = false
    @State private var error: String?
    @State private var saveSuccessful = false
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Add Phone Number")) {
                    Text("To find friends from your contacts, you need to add your phone number to your profile.")
                        .font(.body).foregroundColor(.gray)
                    TextField("Phone Number", text: $phoneNumber)
                        .keyboardType(.phonePad).autocapitalization(.none)
                    if let error = error {
                        Text(error).foregroundColor(.red).font(.caption)
                    }
                }

                Section {
                    Button(action: savePhoneNumber) {
                        Group {
                            if isLoading { ProgressView() }
                            else { Text("Save Phone Number") }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .disabled(phoneNumber.isEmpty || isLoading)
                }

                Section {
                    Button("Skip for Now") {
                        presentationMode.wrappedValue.dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .foregroundColor(.gray)
                }
            }
            .navigationTitle("Phone Number Required")
            .navigationBarTitleDisplayMode(.inline)
            .alert(isPresented: $saveSuccessful) {
                Alert(
                    title: Text("Success"),
                    message: Text("Your phone number has been saved successfully."),
                    dismissButton: .default(Text("OK")) {
                        presentationMode.wrappedValue.dismiss()
                    }
                )
            }
        }
    }

    private func savePhoneNumber() {
        guard !phoneNumber.isEmpty else { return }
        isLoading = true
        error = nil

        // normalize
        let numeric = phoneNumber.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        let formatted = numeric.hasPrefix("1") || numeric.count > 10 ? "+\(numeric)" : "+1\(numeric)"
        print("📱 Updating profile with phone number: \(formatted)")

        // 1️⃣ Attempt JSON PATCH
        APIService.shared
            .updatePhoneNumber(formatted)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { comp in
                    isLoading = false
                    if case let .failure(err) = comp {
                        print("❌ JSON‐patch failed:", err)
                        fetchFullProfile(fallbackPhone: formatted)
                    }
                },
                receiveValue: { wrapper in
                    isLoading = false
                    guard wrapper.success else {
                        fetchFullProfile(fallbackPhone: formatted)
                        return
                    }
                    // JSON‐patch returned ProfileUpdateResponse
                    apply(update: wrapper.user)
                }
            )
            .store(in: &cancellables)
    }

    private func fetchFullProfile(fallbackPhone: String) {
        guard let current = authManager.currentUser else {
            error = "No user session"
            return
        }
        UserAPI.shared.getUserProfile(userId: current.id)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { comp in
                if case let .failure(err) = comp {
                    print("❌ Fallback GET user failed:", err)
                    error = err.localizedDescription
                }
            }, receiveValue: { resp in
                // GET /users/:id returned ProfileResponse.ProfileUser
                apply(profile: resp.user, fallbackPhone: fallbackPhone)
            })
            .store(in: &cancellables)
    }

    // MARK: - Apply Helpers

    /// Merge a ProfileUpdateResponse (from JSON‐patch) into your User model
    private func apply(update u: ProfileUpdateResponse) {
        let updated = User(
            id: u.id,
            username: u.username,
            displayName: u.name,
            email: u.email,
            phoneNumber: u.phoneNumber,
            bio: u.bio,
            photo: u.photo,
            followerCount: u.followerCount,
            followingCount: u.followingCount,
            isPrivate: u.isPrivate,
            emailVerified: u.emailVerified,
            role: u.role,
            isFollowing: authManager.currentUser?.isFollowing ?? false,
            isPending:   authManager.currentUser?.isPending ?? false
        )
        finish(with: updated)
    }

    /// Merge a ProfileResponse.ProfileUser (from GET) into your User model
    private func apply(profile p: ProfileResponse.ProfileUser, fallbackPhone: String) {
        let persisted = p.phoneNumber ?? fallbackPhone
        let updated = User(
            id: p.id,
            username: p.username,
            displayName: p.displayName,
            email: authManager.currentUser?.email,
            phoneNumber: persisted,
            bio: p.bio,
            photo: p.photo,
            followerCount: authManager.currentUser?.followerCount ?? 0,
            followingCount: authManager.currentUser?.followingCount ?? 0,
            isPrivate: p.isPrivate,
            emailVerified: authManager.currentUser?.emailVerified,
            role: authManager.currentUser?.role,
            isFollowing: authManager.currentUser?.isFollowing ?? false,
            isPending:   authManager.currentUser?.isPending ?? false
        )
        finish(with: updated)
    }

    /// Finalize the update: push to AuthManager and trigger success
    private func finish(with user: User) {
        authManager.updateCurrentUser(user)
        print("✅ Phone saved →", user.phoneNumber ?? "(nil)")
        saveSuccessful = true
    }
}
