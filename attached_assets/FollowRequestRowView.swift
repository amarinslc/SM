import SwiftUI

struct FollowRequestRowView: View {
    let request: FollowRequest
    let onAccept: (Int) -> Void
    let onReject: (Int) -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            // Profile image - use displayUser
            let user = request.displayUser
            
            if let photoURL = user.photo, !photoURL.isEmpty {
                AsyncImage(url: URL(string: photoURL)) { phase in
                    switch phase {
                    case .empty:
                        Circle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 50, height: 50)
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(width: 50, height: 50)
                            .clipShape(Circle())
                    case .failure:
                        Circle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 50, height: 50)
                            .overlay(
                                Image(systemName: "person.fill")
                                    .foregroundColor(.gray)
                            )
                    @unknown default:
                        Circle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 50, height: 50)
                    }
                }
            } else {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 50, height: 50)
                    .overlay(
                        Image(systemName: "person.fill")
                            .foregroundColor(.gray)
                    )
            }
            
            // User info
            VStack(alignment: .leading, spacing: 4) {
                Text(user.username)
                    .font(.headline)
                
                Text(user.displayName)
                    .font(.subheadline)
                    .foregroundColor(.gray)
                
                Text("\(request.isIncoming ? "Requested" : "You requested") \(request.formattedDate)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            // Only show action buttons for incoming requests
            if request.isIncoming {
                HStack(spacing: 8) {
                    // Put Accept button first
                    Button {
                        print("🟢 ACCEPT BUTTON TAPPED for request ID: \(request.id)")
                        onAccept(request.id)
                    } label: {
                        Text("Accept")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .frame(width: 70, height: 36)
                            .background(Color("PrimaryColor"))
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                    
                    // Put Reject button second
                    Button {
                        print("🔴 REJECT BUTTON TAPPED for request ID: \(request.id)")
                        onReject(request.id)
                    } label: {
                        Text("Reject")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .frame(width: 70, height: 36)
                            .background(Color.gray.opacity(0.2))
                            .foregroundColor(.primary)
                            .cornerRadius(8)
                    }
                }
            } else {
                // For outgoing requests, show pending status
                Text("Pending")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.gray.opacity(0.2))
                    .foregroundColor(.gray)
                    .cornerRadius(8)
            }
        }
        .padding(.vertical, 4)
    }
}
