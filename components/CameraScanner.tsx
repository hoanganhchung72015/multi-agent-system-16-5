// Tìm hàm captureImage cũ và thay bằng hàm này:
const captureImage = () => {
  if (videoRef.current && canvasRef.current) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // --- BẮT ĐẦU LOGIC THU NHỎ ẢNH ---
    const MAX_WIDTH = 1024; // Giới hạn chiều rộng tối đa
    let targetWidth = video.videoWidth;
    let targetHeight = video.videoHeight;

    // Tính toán tỷ lệ để thu nhỏ mà không làm biến dạng ảnh
    if (targetWidth > MAX_WIDTH) {
      const scaleFactor = MAX_WIDTH / targetWidth;
      targetWidth = MAX_WIDTH;
      targetHeight = video.videoHeight * scaleFactor;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    // --- KẾT THÚC LOGIC THU NHỎ ẢNH ---

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Vẽ ảnh đã được thu nhỏ lên canvas
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      
      // Giảm chất lượng xuống 0.7 (70%) để file cực nhẹ nhưng vẫn rõ nét
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      
      setCapturedImage(base64);
      setCountdown(null);
      stopCamera();
    }
  }
};