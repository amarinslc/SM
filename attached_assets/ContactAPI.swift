//
//  ContactAPI.swift
//  db
//
//  Created by Amarins Laanstra-Corn on 4/21/25.
//

import Foundation
import Combine
import Contacts

// Contact API for contact-related requests
class ContactAPI {
    static let shared = ContactAPI()
    private let apiService = APIService.shared
    
    // Search users by matching contacts (phone numbers and emails)
    func searchContactUsers(phoneNumbers: [String], emails: [String]) -> AnyPublisher<[SimpleUser], NetworkError> {
        print("🔍 Searching for users by contacts")
        let parameters: [String: Any] = [
            "phoneNumbers": phoneNumbers,
            "emails": emails
        ]
        
        print("Contact search payload:", parameters)
        
        return apiService.request(
            endpoint: "/users/contact-search",
            method: .post,
            parameters: parameters
        )
    }
    
    // Request contacts permission and fetch contacts
    func fetchContacts(completion: @escaping (Result<([String], [String]), Error>) -> Void) {
        // Request permission
        let store = CNContactStore()
        store.requestAccess(for: .contacts) { granted, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }
            
            guard granted else {
                DispatchQueue.main.async {
                    completion(.failure(ContactError.permissionDenied))
                }
                return
            }
            
            // Permission granted, fetch contacts
            let keys = [CNContactPhoneNumbersKey, CNContactEmailAddressesKey]
            let request = CNContactFetchRequest(keysToFetch: keys as [CNKeyDescriptor])
            
            var phoneNumbers: [String] = []
            var emails: [String] = []
            
            do {
                try store.enumerateContacts(with: request) { contact, _ in
                    // Get phone numbers
                    for phoneNumber in contact.phoneNumbers {
                        let number = phoneNumber.value.stringValue
                        // Format the phone number consistently
                        let formattedNumber = self.formatPhoneNumber(number)
                        if !formattedNumber.isEmpty {
                            phoneNumbers.append(formattedNumber)
                        }
                    }
                    
                    // Get email addresses
                    for emailAddress in contact.emailAddresses {
                        let email = emailAddress.value as String
                        if !email.isEmpty {
                            emails.append(email.lowercased())
                        }
                    }
                }
                
                DispatchQueue.main.async {
                    completion(.success((phoneNumbers, emails)))
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    // Format phone number to a consistent format
    private func formatPhoneNumber(_ phoneNumber: String) -> String {
        // Strip all non-numeric characters
        let numericString = phoneNumber.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        
        // Add country code if missing
        if numericString.count >= 10 {
            if numericString.hasPrefix("1") {
                return "+\(numericString)"
            } else {
                return "+1\(numericString)"
            }
        }
        
        return numericString.isEmpty ? "" : "+\(numericString)"
    }
}

// Contact-related errors
enum ContactError: Error, LocalizedError {
    case permissionDenied
    case fetchFailed
    
    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Permission to access contacts was denied. Please enable contacts access in your device settings."
        case .fetchFailed:
            return "Failed to fetch contacts from your device."
        }
    }
}
