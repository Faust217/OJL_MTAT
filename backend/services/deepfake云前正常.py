import torch
from torchvision import transforms
from PIL import Image
import timm
import cv2
import face_recognition
import numpy as np
import os

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Path to the trained Xception model (2 classes: Real/Fake)
model_path = "model/xception_deepfake_final.pt"
# Create Xception and load weights
# Note: If loading fails, check model_path and timm version compatibility.
model = timm.create_model('xception', pretrained=False, num_classes=2)
model.load_state_dict(torch.load(model_path, map_location=device))
model.eval().to(device)


# Preprocessing for Xception: 299x299, [-1, 1] normalization
transform = transforms.Compose([
    transforms.Resize((299, 299)),
    transforms.ToTensor(),
    transforms.Normalize([0.5] * 3, [0.5] * 3)
])

def extract_frames(video_path, output_dir="extracted_frames", interval_sec=30):
    vidcap = cv2.VideoCapture(video_path)
    if not vidcap.isOpened():
        print(f"[deepfake.extract_frames] Failed to open video: {video_path}")
        return []

    fps = vidcap.get(cv2.CAP_PROP_FPS) or 0
    if fps <= 0:
        fps = 1.0
    interval = max(1, int(fps * interval_sec))

    success, image = vidcap.read()
    count = 0
    saved = 0
    frame_paths = []

    os.makedirs(output_dir, exist_ok=True)

    while success:
        if count % interval == 0:
            frame_filename = f"{output_dir}/frame{saved}.jpg"
            cv2.imwrite(frame_filename, image)
            frame_paths.append(frame_filename)
            saved += 1
        success, image = vidcap.read()
        count += 1

    vidcap.release()
    print(f"[deepfake.extract_frames] Extraction completed. Saved: {saved} frames.")
    return frame_paths

# -------------------- Image Prediction --------------------
def predict_image(image_path):
    """
    Predict whether an image is Real or Fake.
    If a face is detected, classify the face region; otherwise classify the full image.

    Args:
        image_path (str): Path to the input image.

    Returns:
        tuple[str, float]: (label, score)
            - label: "Fake" or "Real"
            - score: probability of the 'Fake' class in [0, 1]
    """
    # Read BGR image for face detection
    image_cv = cv2.imread(image_path)
    if image_cv is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    # Detect faces; if found, crop the first face for classification
    face_locations = face_recognition.face_locations(image_cv)

    if face_locations:
        top, right, bottom, left = face_locations[0]
        face_img = image_cv[top:bottom, left:right]
        face_img = cv2.resize(face_img, (299, 299))
        # Convert BGR -> RGB for PIL
        face_img = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        image_pil = Image.fromarray(face_img)
    else:
        # Fallback: classify the whole image
        image_pil = Image.open(image_path).convert("RGB")

    # Preprocess and run inference
    image_tensor = transform(image_pil).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(image_tensor)
        probs = torch.softmax(output, dim=1)

        # NOTE: This assumes index 0 corresponds to 'Fake'.
        # If your training used different class ordering, adjust index accordingly.
        score_fake = float(probs[0][0].item())

    label = "Fake" if score_fake > 0.5 else "Real"
    return label, round(score_fake, 4)