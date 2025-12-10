import numpy as np
import matplotlib.pyplot as plt

# Define the point correspondences
M = np.array([
    [-139.6, -120.1],
    [139.6, -120.1]
])

D = np.array([
    [-91.2, -10.7],
    [140.9, -17.0]
])

# Calculate centroids
M_centroid = np.mean(M, axis=0)
D_centroid = np.mean(D, axis=0)

# Center the points
M_centered = M - M_centroid
D_centered = D - D_centroid

# Calculate scale
M_scale = np.sqrt(np.sum(M_centered**2) / len(M_centered))
D_scale = np.sqrt(np.sum(D_centered**2) / len(D_centered))
scale = D_scale / M_scale

# Scale M_centered
M_scaled = M_centered * scale

# Calculate rotation using SVD
H = M_scaled.T @ D_centered
U, S, Vt = np.linalg.svd(H)
R = Vt.T @ U.T

# Ensure proper rotation (det(R) = 1)
if np.linalg.det(R) < 0:
    Vt[-1, :] *= -1
    R = Vt.T @ U.T

# Calculate rotation angle
angle = np.arctan2(R[1, 0], R[0, 0])

# Translation
translation = D_centroid - scale * (R @ M_centroid)

# Apply transformation to M
M_transformed = (scale * (M @ R.T)) + translation

# Print results
print("Transformation Parameters:")
print(f"Scale: {scale:.6f}")
print(f"Rotation angle: {np.degrees(angle):.6f} degrees")
print(f"Translation: ({translation[0]:.6f}, {translation[1]:.6f})")
print(f"\nRotation matrix:\n{R}")
print(f"\nOriginal M points:\n{M}")
print(f"Transformed M points:\n{M_transformed}")
print(f"Target D points:\n{D}")
print(f"\nError (should be close to zero):\n{M_transformed - D}")

# Plot the points
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

# Before transformation
ax1.scatter(M[:, 0], M[:, 1], c='blue', s=100, label='M (original)', marker='o')
ax1.scatter(D[:, 0], D[:, 1], c='red', s=100, label='D (target)', marker='x')
for i, (m, d) in enumerate(zip(M, D)):
    ax1.annotate(f'M{i+1}', m, xytext=(5, 5), textcoords='offset points', color='blue')
    ax1.annotate(f'D{i+1}', d, xytext=(5, 5), textcoords='offset points', color='red')
ax1.set_xlabel('X')
ax1.set_ylabel('Y')
ax1.set_title('Before Transformation')
ax1.legend()
ax1.grid(True, alpha=0.3)
ax1.axis('equal')

# After transformation
ax2.scatter(M_transformed[:, 0], M_transformed[:, 1], c='green', s=100, label='M (transformed)', marker='o')
ax2.scatter(D[:, 0], D[:, 1], c='red', s=100, label='D (target)', marker='x')
for i, (m_t, d) in enumerate(zip(M_transformed, D)):
    ax2.annotate(f'M{i+1}\'', m_t, xytext=(5, 5), textcoords='offset points', color='green')
    ax2.annotate(f'D{i+1}', d, xytext=(5, 5), textcoords='offset points', color='red')
ax2.set_xlabel('X')
ax2.set_ylabel('Y')
ax2.set_title('After Transformation')
ax2.legend()
ax2.grid(True, alpha=0.3)
ax2.axis('equal')

plt.tight_layout()
plt.show()
