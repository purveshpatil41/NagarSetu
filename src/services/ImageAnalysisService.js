class ImageAnalysisService {
  constructor() {
    this.backendUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Could not read image file for upload."));
      reader.readAsDataURL(file);
    });
  }

  async callBackend(file, selectedCategory) {
    const payload = {
      image_data: await this.fileToBase64(file),
      mime_type: file.type || "image/jpeg",
      selected_category: selectedCategory || null,
    };

    const response = await fetch(`${this.backendUrl}/ai/analyze-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Image analysis backend responded with an error.");
    }

    return response.json();
  }

  async validateImage(file, selectedCategory, complaintText = "") {
    if (!file) return null;

    try {
      const backendResult = await this.callBackend(file, selectedCategory);

      if (!backendResult || !backendResult.is_civic_issue || !backendResult.is_relevant) {
        return {
          valid: false,
          relevant: false,
          analysisAvailable: true,
          issue: backendResult?.issue || null,
          detectedIssue: backendResult?.issue || null,
          category: backendResult?.category_label || backendResult?.category || null,
          categoryLabel: backendResult?.category_label || backendResult?.category || null,
          label: backendResult?.issue || null,
          confidence: Number(backendResult?.confidence ?? 0),
          severity: backendResult?.severity || null,
          department: backendResult?.department || null,
          reason: backendResult?.reason || "This image does not appear relevant to the selected complaint.",
          description: backendResult?.description || "",
          suggestedAction: backendResult?.suggested_priority || backendResult?.suggestedAction || "",
        };
      }

      return {
        valid: true,
        relevant: true,
        analysisAvailable: true,
        issue: backendResult.issue || "Civic issue detected",
        detectedIssue: backendResult.issue || "Civic issue detected",
        category: backendResult.category_label || backendResult.category || "General Infrastructure",
        categoryLabel: backendResult.category_label || backendResult.category || "General Infrastructure",
        label: backendResult.issue || "Civic issue detected",
        confidence: Number(backendResult.confidence ?? 0),
        severity: backendResult.severity || "Medium",
        department: backendResult.department || "Municipal Department",
        reason: backendResult.reason || "AI analysis completed.",
        description: backendResult.description || "",
        suggestedAction: backendResult.suggested_priority || backendResult.suggestedAction || "Inspect the affected area and plan the required maintenance.",
        tags: backendResult.tags || [],
      };
    } catch (error) {
      console.warn("[VISION_API] Backend unavailable or no real vision AI is configured.", error?.message || error);
      return {
        valid: false,
        relevant: false,
        analysisAvailable: false,
        issue: null,
        detectedIssue: null,
        category: null,
        categoryLabel: null,
        label: null,
        confidence: 0,
        severity: null,
        department: null,
        reason: "",
        description: "",
        suggestedAction: "",
      };
    }
  }

  async analyzeImage({ file, selectedCategory, complaintText } = {}) {
    if (!file) return null;
    return this.validateImage(file, selectedCategory, complaintText);
  }
}

export const imageAnalysisService = new ImageAnalysisService();
export default imageAnalysisService;
