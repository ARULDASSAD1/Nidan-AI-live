import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import onnxruntime as ort
import os
import urllib.request
from scipy.fft import fft, fftfreq

# 1. Initialize Face Tracking
model_path = "blaze_face_short_range.tflite"
if not os.path.exists(model_path):
    url = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
    urllib.request.urlretrieve(url, model_path)

base_options = python.BaseOptions(model_asset_path=model_path)
options = vision.FaceDetectorOptions(base_options=base_options)
detector = vision.FaceDetector.create_from_options(options)

# 2. Initialize the ONNX Deep Learning Model
# Note: You need an actual rPPG weights file. If it's missing, we use a math fallback.
ONNX_MODEL_PATH = "rppg_model.onnx"
has_onnx_model = os.path.exists(ONNX_MODEL_PATH)

if has_onnx_model:
    print("Loading Deep Learning rPPG Model...")
    ort_session = ort.InferenceSession(ONNX_MODEL_PATH)
else:
    print("WARNING: ONNX model file not found. Falling back to Signal Math.")

def calculate_bpm_from_video(video_path):
    cap = cv2.VideoCapture(video_path)
    frames_processed = 0
    face_crops = []
    
    # Standard input size for most rPPG Neural Networks (PhysNet/DeepPhys)
    IMG_SIZE = 72 

    while cap.isOpened():
        success, frame = cap.read()
        if not success: break

        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        detection_result = detector.detect(mp_image)

        if detection_result.detections:
            bbox = detection_result.detections[0].bounding_box
            x, y, w, h = int(bbox.origin_x), int(bbox.origin_y), int(bbox.width), int(bbox.height)

            # Crop the face, resize to Neural Net standards, and normalize
            face_crop = frame[max(0, y):y+h, max(0, x):x+w]
            if face_crop.size > 0:
                face_resized = cv2.resize(face_crop, (IMG_SIZE, IMG_SIZE))
                face_normalized = face_resized.astype(np.float32) / 255.0
                face_crops.append(face_normalized)
                frames_processed += 1

    cap.release()

    if frames_processed < 30:
        return {"status": "error", "message": "Face not detected properly."}

    # Time-locked FPS assumption for browser WebM uploads
    true_fs = frames_processed / 10.0
    if true_fs < 5.0: true_fs = 30.0

    # ==========================================
    # OPTION B: ONNX NEURAL NETWORK INFERENCE
    # ==========================================
    if has_onnx_model:
        try:
            # Reshape data to fit standard 3D CNN input: (Batch, Channels, Frames, Height, Width)
            input_data = np.array(face_crops)
            input_tensor = np.transpose(input_data, (3, 0, 1, 2)) # Shape to C, T, H, W
            input_tensor = np.expand_dims(input_tensor, axis=0)   # Add Batch dimension
            
            # Run the AI!
            ort_inputs = {ort_session.get_inputs()[0].name: input_tensor}
            ort_outs = ort_session.run(None, ort_inputs)
            
            # The model outputs a pure pulse wave
            pulse_signal = ort_outs[0].flatten()
            
        except Exception as e:
            print(f"ONNX Error: {e}")
            return {"status": "error", "message": "AI Model Inference Failed."}
            
    # ==========================================
    # FALLBACK: Pure Math if ONNX file is missing
    # ==========================================
    else:
        # If you haven't downloaded the weights yet, extract the green channel manually
        pulse_signal = np.array([np.mean(crop[:, :, 1]) for crop in face_crops])
        pulse_signal = (pulse_signal - np.mean(pulse_signal)) / (np.std(pulse_signal) + 1e-6)

    # 3. Final FFT to get the BPM number from the pulse wave
    N = len(pulse_signal)
    windowed = pulse_signal * np.hamming(N)
    yf = np.abs(fft(windowed))
    xf = fftfreq(N, 1 / true_fs)
    
    valid_idx = np.where((xf >= 0.75) & (xf <= 3.0))[0]
    
    if len(valid_idx) == 0:
        return {"status": "error", "message": "Signal corrupted."}

    peak_idx = valid_idx[np.argmax(yf[valid_idx])]
    bpm = xf[peak_idx] * 60.0

    return {"status": "success", "bpm": round(bpm, 1)}