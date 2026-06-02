import io
import math
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import cv2
import numpy as np
import uvicorn

app = FastAPI()

# 프런트엔드(Vite)와의 통신을 위한 CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. 모델 로드 (YOLO Pose 모델 best.pt 파일이 같은 폴더에 있어야 함)
try:
    model = YOLO("best.pt")
    print("✅ YOLO Pose 모델(best.pt) 로드 완료")
except Exception as e:
    print(f"❌ 모델 로드 실패 (best.pt 파일을 확인해주세요): {e}")
    model = None


def detect_card_opencv(image_cv):
    """
    OpenCV를 사용하여 이미지 내에서 표준 신용카드 규격(비율 약 1.58)을 가진 사각형을 탐지합니다.
    Canny Edge, Adaptive Threshold, HSV 색상 마스킹의 하이브리드 조합을 통해
    어두운 야외 환경이나 데크 노이즈 환경에서도 정교하게 카드를 찾아냅니다.
    """
    gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image_cv, cv2.COLOR_BGR2HSV)
    img_height, img_width = image_cv.shape[:2]
    img_area = img_height * img_width

    candidates = []

    # 후보 평가 내부 함수
    def evaluate_contour(contour, method_name):
        area = cv2.contourArea(contour)
        if area < 0.0012 * img_area or area > 0.25 * img_area:
            return

        rect = cv2.minAreaRect(contour)
        (cx, cy), (w, h), angle = rect
        if w == 0 or h == 0:
            return

        aspect_ratio = max(w, h) / min(w, h)
        # 카드 비율인 1.586 부근 필터링 (허용치: 1.25 ~ 1.95)
        if not (1.25 <= aspect_ratio <= 1.95):
            return

        card_est_long = max(w, h)
        min_card_pixel = min(img_height, img_width) * 0.08
        if card_est_long < min_card_pixel:
            return

        rect_area = w * h
        solidity_rect = float(area) / rect_area if rect_area > 0 else 0

        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity_hull = float(area) / hull_area if hull_area > 0 else 0

        # 카드 형태의 솔리디티 조건 만족 시 후보군 추가
        if solidity_rect > 0.60 and solidity_hull > 0.65:
            ar_score = 1.0 - abs(aspect_ratio - 1.586) / 1.586
            score = ar_score * solidity_rect
            
            candidates.append({
                'rect': rect,
                'score': score,
                'method': method_name,
                'area': area
            })

    # --- 방법 1: 다중 Canny Edge 탐색 ---
    for blur_k in [3, 5]:
        blurred = cv2.GaussianBlur(gray, (blur_k, blur_k), 0)
        for thresh in [(40, 120), (70, 180)]:
            edges = cv2.Canny(blurred, thresh[0], thresh[1])
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                evaluate_contour(c, f"Canny_b{blur_k}_t{thresh}")

    # --- 방법 2: 적응형 임계화(Adaptive Thresholding) 탐색 ---
    for block_size in [15, 25]:
        for c_val in [4, 8]:
            thresh_img = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY_INV, block_size, c_val
            )
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            closed = cv2.morphologyEx(thresh_img, cv2.MORPH_CLOSE, kernel)
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                evaluate_contour(c, f"AdaptThresh_b{block_size}_c{c_val}")

    # --- 방법 3: 주요 카드 색상 마스킹 (파란색, 빨간색, 녹색, 노란색, 하얀색) ---
    lower_blue, upper_blue = np.array([90, 35, 35]), np.array([135, 255, 255])
    blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)

    lower_red1, upper_red1 = np.array([0, 40, 40]), np.array([15, 255, 255])
    lower_red2, upper_red2 = np.array([165, 40, 40]), np.array([180, 255, 255])
    red_mask = cv2.bitwise_or(cv2.inRange(hsv, lower_red1, upper_red1), cv2.inRange(hsv, lower_red2, upper_red2))

    lower_green, upper_green = np.array([35, 35, 35]), np.array([85, 255, 255])
    green_mask = cv2.inRange(hsv, lower_green, upper_green)

    lower_yellow, upper_yellow = np.array([15, 35, 35]), np.array([35, 255, 255])
    yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

    lower_white, upper_white = np.array([0, 0, 175]), np.array([180, 40, 255])
    white_mask = cv2.inRange(hsv, lower_white, upper_white)

    color_masks = [
        ("BlueMask", blue_mask), 
        ("RedMask", red_mask),
        ("GreenMask", green_mask),
        ("YellowMask", yellow_mask),
        ("WhiteMask", white_mask)
    ]
    for mask_name, mask in color_masks:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            evaluate_contour(c, mask_name)

    # 가장 신뢰도가 높은 후보 선택
    best_candidate = None
    if len(candidates) > 0:
        candidates.sort(key=lambda x: x['score'], reverse=True)
        best_candidate = candidates[0]

    if best_candidate is not None:
        rect = best_candidate['rect']
        pts = cv2.boxPoints(rect)
        pts = np.intp(pts)

        # 꼭짓점 정렬 (좌상, 우상, 우하, 좌하)
        pts_sum = pts.sum(axis=1)
        top_left = pts[np.argmin(pts_sum)]
        bottom_right = pts[np.argmax(pts_sum)]

        pts_diff = np.diff(pts, axis=1).flatten()
        top_right = pts[np.argmin(pts_diff)]
        bottom_left = pts[np.argmax(pts_diff)]

        sorted_pts = np.array([top_left, top_right, bottom_right, bottom_left])

        w1 = np.linalg.norm(top_left - top_right)
        w2 = np.linalg.norm(bottom_left - bottom_right)
        h1 = np.linalg.norm(top_left - bottom_left)
        h2 = np.linalg.norm(top_right - bottom_right)

        long_side = max((w1 + w2) / 2.0, (h1 + h2) / 2.0)

        # 카드 눕힘 상태 등에 따라 기준 장축 양끝 좌표 설정
        if (w1 + w2) > (h1 + h2):
            card_ends = [top_left.tolist(), top_right.tolist()]
        else:
            card_ends = [top_left.tolist(), bottom_left.tolist()]

        return sorted_pts.tolist(), float(long_side), card_ends

    return None, None, None


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        return {"species": "모델 로드 실패 (best.pt 확인)"}

    # 2. 이미지 읽기
    contents = await file.read()
    pil_image = Image.open(io.BytesIO(contents))
    
    # OpenCV 가공을 위해 BGR Numpy Array로 변환
    image_cv = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    img_height, img_width = image_cv.shape[:2]

    # 3. OpenCV 카드 탐지
    card_coords, card_long_side, card_ends = detect_card_opencv(image_cv)

    # 4. YOLO Pose 추론
    results = model(pil_image)

    species = "알 수 없는 어종"
    confidence = 0.0
    fish_detected = False
    fish_points_pct = []
    card_points_pct = []
    length_cm = None

    if len(results) > 0 and len(results[0].boxes) > 0:
        box = results[0].boxes[0]
        conf = float(box.conf)
        
        # 신뢰도 임계값 설정 (예: 0.4 미만은 무시)
        if conf >= 0.4:
            class_id = int(box.cls)
            species = results[0].names[class_id]
            confidence = conf

            # 키포인트 추출 (snout & tail)
            if hasattr(results[0], 'keypoints') and results[0].keypoints is not None:
                kpts = results[0].keypoints.xy
                if len(kpts) > 0:
                    fish_kpts = kpts[0].tolist()
                    num_kpts = len(fish_kpts)

                    if num_kpts >= 2:
                        # 0번: 머리/입 끝 (snout)
                        snout = fish_kpts[0]
                        # 꼬리 매핑 (3개 키포인트 포즈는 2번이 꼬리 끝, 그 외 포즈 규격은 마지막 인덱스)
                        tail = fish_kpts[2] if num_kpts == 3 else fish_kpts[-1]

                        if snout[0] > 0 and snout[1] > 0 and tail[0] > 0 and tail[1] > 0:
                            fish_detected = True
                            # 프런트엔드 Canvas 가로/세로 비율(0~100)로 변환
                            fish_points_pct = [
                                {
                                    "x": float(snout[0] / img_width * 100),
                                    "y": float(snout[1] / img_height * 100)
                                },
                                {
                                    "x": float(tail[0] / img_width * 100),
                                    "y": float(tail[1] / img_height * 100)
                                }
                            ]

                            # 5. 자동 실측 길이 계산 (신용카드 장축 표준: 8.56cm)
                            if card_coords is not None and card_long_side is not None:
                                fish_pixel_dist = math.sqrt((tail[0] - snout[0])**2 + (tail[1] - snout[1])**2)
                                pixel_per_cm = card_long_side / 8.56
                                
                                # 어종별 V자형 꼬리 보정 계수 (Fork Length -> Total Length)
                                fork_factors = {
                                    "Olive flounder": 1.00,
                                    "Paralichthys olivaceus": 1.00,
                                    "Korea rockfish": 1.00,
                                    "Sebastes schlegelii": 1.00,
                                    "Korean rockfish": 1.00,
                                    "Red seabream": 1.08,
                                    "Pagrus major": 1.08,
                                    "Black porgy": 1.08,
                                    "Acanthopagrus schlegelii": 1.08,
                                    "Rock bream": 1.05,
                                    "Oplegnathus fasciatus": 1.05,
                                    "Chub mackerel": 1.10,
                                    "Scomber japonicus": 1.10,
                                    "Snakehead": 1.00,
                                    "Channa argus": 1.00,
                                    "White trevally": 1.10,
                                    "Pseudocaranx dentex": 1.10,
                                    "Flathead grey mullet": 1.08,
                                    "Mugil cephalus": 1.08,
                                    "Freshwater Eel": 1.00,
                                    "Anguilla japonica": 1.00,
                                    "belone belone": 1.00,
                                    "Hyporhamphus sajori": 1.00,
                                    "Japanese amberjack": 1.10,
                                    "Seriola quinqueradiata": 1.10,
                                    "Black Scraper": 1.00,
                                    "Thamnaconus modestus": 1.00,
                                    "Japanese Spanish mackerel": 1.10,
                                    "Scomberomorus niphonius": 1.10,
                                    "Silver sillago": 1.03,
                                    "Sillago sihama": 1.03,
                                    "Bluefin gurnard": 1.02,
                                    "Chelidonichthys spinosus": 1.02
                                }
                                clean_species = species.replace("_", " ")
                                factor = fork_factors.get(clean_species, 1.00)
                                length_cm = round((fish_pixel_dist / pixel_per_cm) * factor, 1)

    # 카드 양 끝점 좌표 백분율 변환
    if card_ends is not None:
        card_points_pct = [
            {
                "x": float(card_ends[0][0] / img_width * 100),
                "y": float(card_ends[0][1] / img_height * 100)
            },
            {
                "x": float(card_ends[1][0] / img_width * 100),
                "y": float(card_ends[1][1] / img_height * 100)
            }
        ]

    print(f"🔍 탐지 결과: {species} (신뢰도: {confidence:.2f}), 길이: {length_cm} cm")

    return {
        "species": species,
        "confidence": confidence,
        "card_detected": card_ends is not None,
        "card_points": card_points_pct,
        "fish_detected": fish_detected,
        "fish_points": fish_points_pct,
        "length": length_cm
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)