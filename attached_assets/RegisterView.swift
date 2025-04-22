//
//  RegisterView.swift
//  Dunbar Social
//
//  Created by Amarins Laanstra-Corn on 4/1/25.
//


import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var authManager: AuthManager
    
    // Registration fields
    @State private var username = ""
    @State private var email = ""
    @State private var phoneNumber = "" // Added phone number field
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var name = ""
    @State private var bio = ""
    @State private var profileImage: UIImage? = nil
    @State private var showingImagePicker = false
    @State private var showingAlert = false
    @State private var showPasswordMismatchAlert = false
    
    // State variables to control Terms and Conditions popup
    @State private var showTermsPopup = false
    @State private var termsAccepted = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Profile image selector
                ZStack {
                    if let image = profileImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                    } else {
                        Circle()
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: 100, height: 100)
                        Image(systemName: "person.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.gray)
                    }
                    
                    // Camera icon overlay
                    Circle()
                        .fill(Color("PrimaryColor"))
                        .frame(width: 30, height: 30)
                        .overlay(
                            Image(systemName: "camera.fill")
                                .font(.system(size: 15))
                                .foregroundColor(.white)
                        )
                        .offset(x: 35, y: 35)
                }
                .onTapGesture {
                    showingImagePicker = true
                }
                .sheet(isPresented: $showingImagePicker) {
                    ImagePicker(
                        image: $profileImage,
                        sourceType: .photoLibrary
                    )
                }
                
                // Form fields
                Group {
                    FormField(title: "Username", placeholder: "Choose a username", text: $username)
                        .autocapitalization(.none)
                    FormField(title: "Email", placeholder: "Enter your email", text: $email)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    FormField(title: "Phone Number", placeholder: "Enter your phone number", text: $phoneNumber)
                        .keyboardType(.phonePad)
                    FormField(title: "Password", placeholder: "Create a password", text: $password, isSecure: true)
                    FormField(title: "Confirm Password", placeholder: "Confirm your password", text: $confirmPassword, isSecure: true)
                    FormField(title: "Name", placeholder: "Enter your full name", text: $name)
                    FormField(title: "Bio", placeholder: "Tell us about yourself", text: $bio)
                }
                
                // Register button - first checks for Terms acceptance.
                Button(action: {
                    if !termsAccepted {
                        showTermsPopup = true
                    } else {
                        register()
                    }
                }) {
                    if authManager.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Text("Create Account")
                            .fontWeight(.bold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color("PrimaryColor"))
                .foregroundColor(.white)
                .cornerRadius(10)
                .disabled(!isFormValid || authManager.isLoading)
                .opacity((!isFormValid || authManager.isLoading) ? 0.6 : 1)
                
                // Terms and Conditions note (tappable)
                Text("By signing up, you agree to our Terms, Data Policy and Cookies Policy.")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding(.top, 10)
                    .padding(.bottom, 30)
                    .onTapGesture {
                        if password == confirmPassword {
                            showTermsPopup = true
                        } else {
                            showPasswordMismatchAlert = true
                        }
                    }
            }
            .padding(.horizontal, 30)
        }
        // Existing registration failure alert
        .alert(isPresented: $showingAlert) {
            Alert(
                title: Text("Registration Failed"),
                message: Text(authManager.error ?? "An unknown error occurred"),
                dismissButton: .default(Text("OK"))
            )
        }
        // New password mismatch alert before agreeing
        .alert(isPresented: $showPasswordMismatchAlert) {
            Alert(
                title: Text("Passwords do not match"),
                message: Text("Please make sure your passwords match before agreeing to the Terms and Conditions."),
                dismissButton: .default(Text("OK"))
            )
        }
        // Present the Terms and Conditions popup
        .sheet(isPresented: $showTermsPopup) {
            TermsAndConditionsView(
                onAgree: {
                    // Only proceed if passwords still match
                    if password == confirmPassword {
                        termsAccepted = true
                        showTermsPopup = false
                        register()
                    } else {
                        showPasswordMismatchAlert = true
                    }
                },
                onDisagree: {
                    showTermsPopup = false
                }
            )
        }
    }
    
    // Validation for the registration form fields - updated to include phone number
    private var isFormValid: Bool {
        !username.isEmpty &&
        !email.isEmpty &&
        !phoneNumber.isEmpty && // Added phone number validation
        !password.isEmpty &&
        !confirmPassword.isEmpty &&
        !name.isEmpty &&
        password == confirmPassword &&
        password.count >= 6 &&
        email.contains("@")
    }
    
    // Registration function that calls the AuthManager - updated with phone number
    private func register() {
        // Since all accounts are now private, we always pass 'true' for isPrivate.
        let imageData = profileImage?.jpegData(compressionQuality: 0.7)
        authManager.register(
            username: username,
            email: email,
            password: password,
            confirmPassword: confirmPassword,
            name: name,
            phoneNumber: phoneNumber, // Added phone number
            bio: bio.isEmpty ? nil : bio,
            isPrivate: true,
            profileImage: imageData
        ) { success in
            if !success {
                showingAlert = true
            }
        }
    }
}

struct RegisterView_Previews: PreviewProvider {
    static var previews: some View {
        RegisterView().environmentObject(AuthManager.shared)
    }
}
