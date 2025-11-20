document.addEventListener('DOMContentLoaded', () => {
  const analysisResultsDiv = document.getElementById('analysis-results');
  
  // --- Modal Elements ---
  const suggestionsModal = document.getElementById('suggestions-modal');
  const profileModal = document.getElementById('profile-modal');
  const modals = document.querySelectorAll('.modal');
  
  const suggestionsBtn = document.getElementById('suggestions-btn');
  const profileBtn = document.getElementById('profile-btn');
  const saveSuggestionBtn = document.getElementById('save-suggestion-btn');
  const closeBtns = document.querySelectorAll('.close-btn');
  
  const suggestionText = document.getElementById('suggestion-text');

  // --- Modal Logic ---
  suggestionsBtn.onclick = () => { suggestionsModal.style.display = 'block'; };
  profileBtn.onclick = () => { profileModal.style.display = 'block'; };

  const closeAllModals = () => {
    modals.forEach(modal => { modal.style.display = 'none'; });
  };

  closeBtns.forEach(btn => { btn.onclick = closeAllModals; });

  window.onclick = (event) => {
    modals.forEach(modal => {
      if (event.target === modal) {
        closeAllModals();
      }
    });
  };

  // --- Suggestions Specific Logic ---
  const savedSuggestion = localStorage.getItem('suggestion');
  if (savedSuggestion) {
    suggestionText.value = savedSuggestion;
  }
  saveSuggestionBtn.onclick = function() {
    localStorage.setItem('suggestion', suggestionText.value);
    saveSuggestionBtn.textContent = 'Saved!';
    setTimeout(() => {
      suggestionsModal.style.display = "none";
      saveSuggestionBtn.textContent = 'Save Suggestion';
    }, 1000);
  }
  // --- End of Modal Logic ---

  function parseMoney(moneyString) {
      if (typeof moneyString !== 'string' || moneyString === 'N/A') return 0;
      let num = parseFloat(moneyString.replace(/[^0-9.]/g, ''));
      if (moneyString.toUpperCase().includes('K')) {
          num *= 1000;
      }
      if (moneyString.toUpperCase().includes('M')) {
          num *= 1000000;
      }
      return num;
  }

  // Query the active tab and send a message to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Ensure we have a tab and it has a URL
    if (tabs.length === 0 || !tabs[0].url) {
      analysisResultsDiv.innerHTML = '<p class="error">Could not access tab information.</p>';
      return;
    }

    // Check if the tab is an Upwork job page
    if (!tabs[0].url.includes('upwork.com/jobs/')) {
      analysisResultsDiv.innerHTML = '<p class="error">This is not an Upwork job page. Please navigate to a job post to use this extension.</p>';
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    }, () => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'analyzeJob' }, (response) => {
        if (chrome.runtime.lastError) {
          analysisResultsDiv.innerHTML = `<p class="error">Error: ${chrome.runtime.lastError.message}</p>`;
          return;
        }
        if (response && response.jobData) {
          renderJobData(response.jobData);
          setupButtons(response.jobData);
        } else {
          analysisResultsDiv.innerHTML = '<p class="error">Failed to retrieve job data. The page structure might have changed.</p>';
        }
      });
    });
  });

  function calculateClientScore(data) {
    // --- Parse data into usable formats ---
    const rating = parseFloat(data.rating); // Becomes NaN for "N/A"
    const reviewsCount = parseInt((data.reviewsCount || '').match(/(\d+)/)?.[1] || 0);
    const totalSpent = parseMoney(data.totalSpent);
    const hireRate = parseInt((data.hireRate || '').replace('%', '')); // Becomes NaN for "N/A"
    const jobsPosted = parseInt(data.jobsPosted); // Becomes NaN for "N/A"
    const avgHourlyRate = parseMoney(data.avgHourlyRate);
    const hires = parseInt(data.hires); // Becomes NaN for "N/A"

    let memberSinceMonths = 0;
    if (data.memberSince && data.memberSince !== 'N/A') {
      const joinDate = new Date(data.memberSince);
      if (!isNaN(joinDate)) {
        const currentDate = new Date();
        memberSinceMonths = (currentDate.getFullYear() - joinDate.getFullYear()) * 12 + (currentDate.getMonth() - joinDate.getMonth());
      }
    }

    const hasHistoryWithFixedPrice = (data.clientHistory || []).some(item => {
        if (item.jobPrice && (item.jobPrice || '').toLowerCase().includes('fixed-price')) {
            const match = item.jobPrice.match(/\$([\d,]+\.?\d*)/);
            return match && match[1];
        }
        return false;
    });

    // --- Stricter criteria for Promising New Client, including minimum rate ---
    const isPromisingNewClient = memberSinceMonths < 6 && hireRate === 100 && rating === 5.0 && avgHourlyRate >= 10;

    // --- Level 1: Calculate all potential deal-breakers (Red) ---
    const dangerReasons = [];
    if (data.paymentVerified === 'No') dangerReasons.push('طريقة الدفع غير موثقة');
    if (totalSpent === 0) dangerReasons.push('الإنفاق صفر (عميل جديد تمامًا)');
    if (isNaN(rating)) dangerReasons.push('لا يوجد تقييم للعميل');
    if (isNaN(hireRate) || hireRate === 0) dangerReasons.push('لا يوجد معدل توظيف أو أنه 0%');
    if (isNaN(jobsPosted)) dangerReasons.push('لا يوجد تاريخ لعدد الوظائف المنشورة');
    if (!isNaN(hireRate) && hireRate < 70 && !isNaN(jobsPosted) && jobsPosted > 5) dangerReasons.push('معدل التوظيف منخفض جدًا');
    if (!isNaN(rating) && rating < 4.0) dangerReasons.push('تقييم العميل منخفض جدًا');
    if (avgHourlyRate > 0 && avgHourlyRate < 9) dangerReasons.push('متوسط سعر الساعة منخفض جداً');

    // --- Level 2: Calculate all potential warnings (Yellow) ---
    const warningReasons = [];
    if (isPromisingNewClient) {
        // This client gets a special, single "warning"
        warningReasons.push('عميل واعد بمؤشرات مثالية، لكنه يمثل خطورة عالية جدًا لعدم وجود تاريخ حقيقي له. تعامل معه كعميل جديد تمامًا.');
    } else {
        // --- General warnings for non-promising clients ---
        if (totalSpent > 0 && totalSpent < 5000) warningReasons.push('إجمالي الإنفاق أقل من 5 آلاف');

        const ratingIsWeak = !isNaN(rating) && rating >= 4.0 && rating < 4.6;
        const reviewsAreLow = reviewsCount < 10 && reviewsCount > 0;
        if (ratingIsWeak && reviewsAreLow) warningReasons.push('تقييم العميل ضعيف نوعا ما وعدد المراجعات قليل');
        else if (ratingIsWeak) warningReasons.push('تقييم العميل ضعيف نوعا ما');
        else if (reviewsAreLow) warningReasons.push(rating === 5 ? 'عدد المراجعات قليل على الرغم من التقييم الكامل' : 'عدد المراجعات قليل');

        const hireRateIsMid = !isNaN(hireRate) && hireRate >= 60 && hireRate <= 85;
        const hireRateIsHighOnFewJobs = !isNaN(hireRate) && hireRate > 85 && !isNaN(jobsPosted) && jobsPosted <= 5;
        if (hireRateIsMid) warningReasons.push('معدل توظيف العميل ليس مرتفعًا');
        else if (hireRateIsHighOnFewJobs) warningReasons.push('معدل التوظيف عالٍ لكن لعدد قليل من الوظائف');
        
        if (!isNaN(hireRate) && hireRate < 60) warningReasons.push('معدل التوظيف منخفض جدًا');
        if (!isNaN(jobsPosted) && jobsPosted <= 5) warningReasons.push('لديه عدد قليل من الوظائف السابقة');
        
        // Tiered rate warnings
        if (avgHourlyRate >= 9 && avgHourlyRate < 10) {
            warningReasons.push('متوسط سعر الساعة منخفض');
        } else if (avgHourlyRate >= 10 && avgHourlyRate <= 15) {
            warningReasons.push('متوسط سعر الساعة مقبول ولكنه ليس مرتفعًا');
        }
        
        if (avgHourlyRate === 0 && !hasHistoryWithFixedPrice) warningReasons.push('لا يتوفر متوسط سعر للساعة أو تاريخ لمشاريع بسعر ثابت للتقييم');
        if (memberSinceMonths < 3) warningReasons.push('العميل جديد على المنصة');
    }

    const uniqueDangerReasons = [...new Set(dangerReasons)];
    const uniqueWarningReasons = [...new Set(warningReasons)];

    // --- Final Evaluation: Check for Dangers First ---
    if (uniqueDangerReasons.length > 0) {
      let score;
      if (uniqueDangerReasons.length >= 3) score = 0.0;
      else if (uniqueDangerReasons.length === 2) score = 1.0;
      else score = 2.0;
      // As requested, combine danger and warning reasons in the tooltip for danger status
      const allReasons = [...uniqueDangerReasons, ...uniqueWarningReasons];
      return { score: score, status: 'danger', reasons: [...new Set(allReasons)] };
    }

    // --- If no dangers, proceed with normal/warning/promising logic ---
    let score = 5.0;
    let status = 'normal';

    if (isPromisingNewClient) {
        status = 'promising';
    } else if (uniqueWarningReasons.length > 0) {
        status = 'warning';
    }

    // --- Level 3: Point-based Scoring ---
    if (data.paymentVerified === 'Yes') score += 1.5;
    
    if (!isNaN(rating)) {
        if (rating >= 4.9 && reviewsCount >= 20) score += 2.0;
        else if (rating >= 4.7 && reviewsCount >= 10) score += 1.0;
        else if (rating < 4.5) score -= 1.5;
    }
    if (reviewsCount < 5 && !isPromisingNewClient) score -= 1.0;

    if (totalSpent > 50000) score += 1.5;
    else if (totalSpent > 10000) score += 1.0;
    else if (totalSpent > 5000) score += 0.5;
    else if (totalSpent > 0 && totalSpent <= 5000 && !isPromisingNewClient) score -= 1.0;

    if (!isNaN(hireRate) && !isNaN(jobsPosted)) {
        if (hireRate >= 80 && jobsPosted >= 10) score += 1.0;
        else if (hireRate >= 50) score += 0.5;
    }
    
    if (memberSinceMonths > 24) score += 1.0;
    else if (memberSinceMonths > 12) score += 0.5;

    if (avgHourlyRate > 40) {
        score += 1.0;
    } else if (avgHourlyRate >= 10 && avgHourlyRate < 15) {
        score -= 1.0;
    } else if (avgHourlyRate > 0 && avgHourlyRate < 10) {
        score -= 1.5;
    } else if (avgHourlyRate === 0 && !hasHistoryWithFixedPrice) {
        score -= 1.5;
    }

    score = Math.max(0, Math.min(10, score));

    return { score: score, status: status, reasons: uniqueWarningReasons };
  }

  function renderJobData(data) {
    const idealClientCriteria = {
        rating: 5,
        reviewsCount: 35,
        memberSinceMonths: 24,
        avgHourlyRate: 30,
        totalSpent: 100000,
        jobsPosted: 50,
        hireRate: 90
    };

    const legendaryClientCriteria = {
        rating: 5,
        reviewsCount: 100,
        memberSinceMonths: 60,
        avgHourlyRate: 60,
        totalSpent: 500000,
        jobsPosted: 100,
        hireRate: 100
    };

    const userExperience = localStorage.getItem('userExperienceLevel');
    const paymentVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="var(--icon-color, #14a800)" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="var(--icon-color, #14a800)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="var(--icon-color-bg, #fff)" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15.5 9.7L11 14.3l-2.5-2.5"></path></svg>`;
    const paymentNotVerifiedIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#d93025" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#d93025" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M15 9l-6 6m0-6l6 6"></path></svg>`;
    const proposalsWarningIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><path fill="#ffc107" fill-rule="evenodd" vector-effect="non-scaling-stroke" stroke="#ffc107" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="1.5" d="M20.4 13.1c.8 1 .3 2.5-.9 2.9-.8.2-1.3 1-1.3 1.8 0 1.3-1.2 2.2-2.5 1.8-.8-.3-1.7 0-2.1.7-.7 1.1-2.3 1.1-3 0-.5-.7-1.3-1-2.1-.7-1.4.4-2.6-.6-2.6-1.8 0-.8-.5-1.6-1.3-1.8-1.2-.4-1.7-1.8-.9-2.9.5-.7.5-1.6 0-2.2-.9-1-.4-2.5.9-2.9.8-.2 1.3-1 1.3-1.8C5.9 5 7.1 4 8.3 4.5c.8.3 1.7 0 2.1-.7.7-1.1 2.3-1.1 3 0 .5.7 1.3 1 2.1.7 1.4-.5 2.6.5 2.6 1.7 0 .8.5 1.6 1.3 1.8 1.2.4 1.7 1.8.9 2.9-.4.6-.4 1.6.1 2.2z" clip-rule="evenodd"></path><path vector-effect="non-scaling-stroke" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="2" d="M12 8v6m0 3v.01"></path></svg>`;
    const idealClientIcon = `<svg class="verified-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-hidden="true"><defs><linearGradient id="ideal-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#FFD700;" /><stop offset="100%" style="stop-color:#B8860B;" /></linearGradient></defs><path fill="url(#ideal-gradient)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path fill="#fff" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    const legendaryClientIcon = `<svg width="40" height="40" viewBox="0 0 24 24" role="img" aria-hidden="true" style="vertical-align: middle;"><defs><linearGradient id="legendary-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#A020F0;"/><stop offset="100%" style="stop-color:#4B0082;"/></linearGradient></defs><path fill="url(#legendary-gradient)" d="M12 1L2 8.5V15.5L12 23L22 15.5V8.5L12 1Z"/><path d="M10.5 7.5 L 10.5 14.5 L 14.5 14.5" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const icons = { paymentVerifiedIcon, paymentNotVerifiedIcon, proposalsWarningIcon, idealClientIcon, legendaryClientIcon };

    const clientScoreResult = calculateClientScore(data);

    const clientScore = clientScoreResult.status === 'danger' ? clientScoreResult.score.toFixed(0) : clientScoreResult.score.toFixed(1);
    let scoreStatusClass = '';
    if (clientScoreResult.status === 'danger') {
      scoreStatusClass = 'score-danger';
    } else if (clientScoreResult.status === 'warning') {
      scoreStatusClass = 'score-warning';
    } else if (clientScoreResult.status === 'promising') {
      scoreStatusClass = 'score-promising';
    }

    let scoreTooltipHtml = '';
    if (clientScoreResult.reasons.length > 0) {
      const reasonsHtml = clientScoreResult.reasons.map(reason => `<li>- ${reason}</li>`).join('');
      scoreTooltipHtml = `<span class="tooltip-text"><ul>${reasonsHtml}</ul></span>`;
    }

    const scoreDisplayClass = `client-score-display ${scoreStatusClass} ${scoreTooltipHtml ? 'tooltip-container' : ''}`.trim();

    let scoreStatusIconHtml = '';
    let iconSvg = '';
    if (clientScoreResult.status === 'danger') {
      iconSvg = paymentNotVerifiedIcon;
    } else if (clientScoreResult.status === 'warning') {
      iconSvg = proposalsWarningIcon;
    } else if (clientScoreResult.status === 'promising') {
      iconSvg = idealClientIcon;
    } else {
      iconSvg = paymentVerifiedIcon;
    }
    scoreStatusIconHtml = iconSvg.replace('class="verified-icon"', 'class="verified-icon score-status-icon"');

    let historyHtml = (data.clientHistory || []).map(item => `
      <div class="history-item">
        <strong>${item.projectTitle || 'N/A'}</strong>
        <p><em>Feedback to Client:</em> ${item.freelancerFeedback || 'N/A'}</p>
        <p><em>Feedback from Client:</em> ${item.clientFeedback || 'N/A'}</p>
      </div>
    `).join('');

    let proposalsIcon = '';
    let proposalsTooltipText = '';
    if ((data.proposals || '').toLowerCase().includes('50+')) {
        proposalsIcon = paymentNotVerifiedIcon; // RED
        proposalsTooltipText = 'عدد المتقدمين مرتفع جدًا، المنافسة شرسة.';
    } else if ((data.proposals || '').toLowerCase().includes('less than 5')) {
        proposalsIcon = paymentVerifiedIcon; // GREEN
        proposalsTooltipText = 'عدد المتقدمين منخفض جدًا، فرصة ممتازة للتقديم.';
    } else {
        const match = (data.proposals || '').match(/(\d+)\s*to\s*(\d+)/);
        if (match) {
            const upperLimit = parseInt(match[2]);
            if (upperLimit <= 15) {
                proposalsIcon = paymentVerifiedIcon; // GREEN
                proposalsTooltipText = 'عدد المتقدمين منخفض، فرصة جيدة للتقديم.';
            } else if (upperLimit <= 20) {
                proposalsIcon = proposalsWarningIcon; // YELLOW
                proposalsTooltipText = 'عدد المتقدمين متوسط، والمنافسة بدأت تزيد. قدم بحذر.';
            } else if (upperLimit <= 50) {
                proposalsIcon = proposalsWarningIcon; // YELLOW
                proposalsTooltipText = 'عدد المتقدمين متوسط إلى مرتفع جدًا، لكن لا تزال هناك فرصة. قدم بحذر.';
            }
        }
    }

    let proposalsIconWithTooltip = '';
    if (proposalsIcon) {
        proposalsIconWithTooltip = `<span class="tooltip-container">${proposalsIcon}<span class="tooltip-text">${proposalsTooltipText}</span></span>`;
    }

    function generateStars(rating) {
        const totalStars = 5;
        const fullStar = '★';
        const emptyStar = '☆';
        const roundedRating = Math.round(rating);
        let stars = '';
        if (isNaN(roundedRating) || rating === 'N/A') return '';
        for (let i = 0; i < totalStars; i++) {
            stars += i < roundedRating ? fullStar : emptyStar;
        }
        return `<span class="star-rating">${stars}</span>`;
    }

    const starRating = generateStars(parseFloat(data.rating));

    let paymentVerifiedIconWithTooltip = '';
    if (data.paymentVerified === 'Yes') {
        paymentVerifiedIconWithTooltip = `<span class="tooltip-container">${paymentVerifiedIcon}<span class="tooltip-text">طريقة الدفع موثقة لدى موقع Upwork. يقلل من مخاطر عدم الدفع.</span></span>`;
    } else {
        paymentVerifiedIconWithTooltip = `<span class="tooltip-container">${paymentNotVerifiedIcon}<span class="tooltip-text">طريقة الدفع غير موثقة لدى موقع Upwork. قد يزيد من مخاطر عدم الدفع.</span></span>`;
    }

    let clientRatingIconWithTooltip = '';
    if (data.rating === 'N/A') {
        clientRatingIconWithTooltip = `<span class="tooltip-container">${paymentNotVerifiedIcon}<span class="tooltip-text">عميل جديد تمامًا بدون تقييمات. أعلى درجة من المخاطرة.</span></span>`;
    } else {
        const ratingValue = parseFloat(data.rating);
        const reviewsCountMatch = (data.reviewsCount || '').match(/(\d+)/);
        const reviewsCount = reviewsCountMatch ? parseInt(reviewsCountMatch[1]) : 0;
        let icon = '';
        let tooltipText = '';
        const readReviewsAdvice = ' نصيحة: اقرأ المراجعات دائمًا قبل التقديم.';

        // --- NEW RULE 1 (HIGHEST PRIORITY) ---
        if (reviewsCount <= 5) {
            icon = paymentNotVerifiedIcon; // RED
            tooltipText = 'عدد المراجعات قليل جدًا. من الصعب الحكم على العميل بشكل دقيق. تعامل بحذر شديد.';
        } 
        // --- NEW RULE 2 (SECOND PRIORITY) ---
        else if (ratingValue === 5 && reviewsCount < 10) {
            icon = proposalsWarningIcon; // YELLOW
            tooltipText = 'تقييم العميل ممتاز، لكن عدد المراجعات لا يزال منخفضًا. مؤشر جيد ولكن يتطلب الحذر.';
        } 
        // --- ORIGINAL LOGIC (FALLBACK) ---
        else {
            if (ratingValue === 5 && reviewsCount > 35) {
                icon = paymentVerifiedIcon;
                tooltipText = 'عميل مثالي بتقييم 5 نجوم وعدد كبير من المراجعات. فرصة ذهبية للعمل معه!';
            } else if (ratingValue === 5 && reviewsCount <= 35) { // This now implicitly means reviewsCount is between 10 and 35
                icon = paymentVerifiedIcon;
                tooltipText = 'تقييم العميل ممتاز ولديه عدد كافٍ من المراجعات. مؤشر إيجابي للغاية.';
            } else if (ratingValue >= 4.5 && ratingValue < 5) {
                icon = paymentVerifiedIcon;
                tooltipText = 'تقييم العميل جيد جدًا، لكنه ليس مثاليًا.' + readReviewsAdvice;
            } else if (ratingValue >= 4.1 && ratingValue < 4.5) {
                icon = proposalsWarningIcon;
                tooltipText = 'العميل لديه مراجعات سيئة سابقة. قدم فقط إذا كنت تعرف ما تفعل وبحذر شديد.' + readReviewsAdvice;
            } else if (ratingValue < 4.1) {
                icon = paymentNotVerifiedIcon;
                tooltipText = 'تقييم العميل منخفض جدًا. يمثل مخاطرة عالية. لا تقدم إلا للضرورة القصوى.' + readReviewsAdvice;
            }
        }
        
        if (icon) {
            clientRatingIconWithTooltip = `<span class="tooltip-container">${icon}<span class="tooltip-text">${tooltipText}</span></span>`;
        }
    }

            let totalSpentIconWithTooltip = '';
            const spentAmount = parseMoney(data.totalSpent);
            let avgRateValue = parseMoney(data.avgHourlyRate);
    
            if (spentAmount > 100000) {
                const tooltipText = 'إنفاق خرافي! عميل من الطراز الرفيع جدًا.';
                totalSpentIconWithTooltip = `<span class="tooltip-container">${paymentVerifiedIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
            } else if (spentAmount > 35000) {
                const tooltipText = 'إنفاق ممتاز. عميل جاد ومستثمر بقوة.';
                totalSpentIconWithTooltip = `<span class="tooltip-container">${paymentVerifiedIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
            } else if (spentAmount > 5000) {
                const tooltipText = 'إنفاق جيد. مؤشر قوي على الجدية.';
                totalSpentIconWithTooltip = `<span class="tooltip-container">${paymentVerifiedIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
            } else if (spentAmount > 0) { // Covers the 0 to 5000 range
                let tooltipText = '';
                if (avgRateValue > 25) {
                    tooltipText = 'إجمالي الإنفاق منخفض، لكن متوسط سعر الساعة الذي يدفعه جيد.';
                } else if (avgRateValue <= 15 && avgRateValue > 0) {
                    tooltipText = 'إجمالي ما انفقه العميل على منصة Upwork منخفض ، وتدل الاحصائيات ان السعر الذي يدفعه منخفض أيضا. هذا يعني أنه لا يدفع كثيرا.';
                } else {
                    tooltipText = 'العميل لديه سجل إنفاق لكنه ليس كبيرًا. قم بتقييم بقية العوامل.';
                }
                totalSpentIconWithTooltip = `<span class="tooltip-container">${proposalsWarningIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
            } else { // This covers N/A and $0
                const tooltipText = 'العميل لم ينفق ﺃي مبالغ على منصة Upwork من قبل وهذا يمثل خطورة عالية جدا في التقديم';
                totalSpentIconWithTooltip = `<span class="tooltip-container">${paymentNotVerifiedIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
            }
    let jobsPostedIcon = '';
    let jobsPostedTooltipText = '';
    const jobsPostedValue = parseInt(data.jobsPosted);
    const hireRateValue = parseInt((data.hireRate || '').replace('%', ''));

    if (data.jobsPosted === 'N/A') {
        jobsPostedIcon = paymentNotVerifiedIcon;
        jobsPostedTooltipText = 'لا توجد بيانات عن عدد الوظائف التي نشرها العميل.';
    } else if (jobsPostedValue > 50 && hireRateValue > 85) { // Updated condition from 75 to 85
        jobsPostedIcon = paymentVerifiedIcon;
        jobsPostedTooltipText = 'عميل متمرس وخبير في التوظيف على المنصة ويوظف بانتظام.';
    } else if (jobsPostedValue <= 5 && hireRateValue >= 90) { // New yellow condition
        jobsPostedIcon = proposalsWarningIcon;
        jobsPostedTooltipText = 'العميل ينشر وظائف قليلة لكنه جاد جدًا في التوظيف عند النشر. فرصة جيدة إذا كانت الوظيفة تناسبك تمامًا.';
    } else if (jobsPostedValue <= 5 && hireRateValue < 90) {
        jobsPostedIcon = paymentNotVerifiedIcon;
        jobsPostedTooltipText = 'نشر عددًا قليلًا جدًا من الوظائف ولا يبدو أنه يوظف بانتظام.';
    }
    // For other cases, jobsPostedIcon remains empty, meaning no icon will be displayed.

    let jobsPostedIconWithTooltip = '';
    if (jobsPostedIcon) {
        jobsPostedIconWithTooltip = `<span class="tooltip-container">${jobsPostedIcon}<span class="tooltip-text">${jobsPostedTooltipText}</span></span>`;
    }

    let hireRateIcon = '';
    let hireRateTooltipText = '';
    if (data.hireRate === 'N/A') {
        hireRateIcon = paymentNotVerifiedIcon;
        hireRateTooltipText = 'لا يوجد معدل توظيف متاح. قد يكون العميل جديدًا أو لا يوظف كثيرًا. كن حذرًا.';
    } else {
        const hireRateValue = parseInt((data.hireRate || '').replace('%', ''));
        const jobsPostedValue = parseInt(data.jobsPosted);

        if (hireRateValue < 60) {
            hireRateIcon = paymentNotVerifiedIcon;
            hireRateTooltipText = 'معدل التوظيف منخفض جدًا. هذا العميل لا يميل إلى توظيف المستقلين الذين يتواصل معهم. فرصة التوظيف لديك ضعيفة.';
        } else if (hireRateValue >= 60 && hireRateValue <= 85) {
            hireRateIcon = proposalsWarningIcon;
            hireRateTooltipText = 'معدل التوظيف متوسط. العميل يوظف أحيانًا، لكنه ليس حاسمًا دائمًا. قدم بحذر.';
        } else if (hireRateValue > 85) {
            if (jobsPostedValue > 5) {
                hireRateIcon = paymentVerifiedIcon;
                hireRateTooltipText = 'معدل توظيف ممتاز! هذا العميل يوظف بانتظام. فرصة جيدة جدًا للتوظيف.';
            } else {
                hireRateIcon = proposalsWarningIcon;
                hireRateTooltipText = 'معدل التوظيف مرتفع، لكن العميل نشر عددًا قليلاً من الوظائف. قد يكون جديدًا أو لا يستخدم المنصة كثيرًا. راجع نوعية أعماله السابقة.';
            }
        }
    }
    let hireRateIconWithTooltip = '';
    if (hireRateIcon) {
        hireRateIconWithTooltip = `<span class="tooltip-container">${hireRateIcon}<span class="tooltip-text">${hireRateTooltipText}</span></span>`;
    }

    let memberSinceIconWithTooltip = '';
    if (data.memberSince && data.memberSince !== 'N/A') {
        const joinDate = new Date(data.memberSince);
        const currentDate = new Date();
        if (!isNaN(joinDate)) {
            const totalMonths = (currentDate.getFullYear() - joinDate.getFullYear()) * 12 + (currentDate.getMonth() - joinDate.getMonth());
            let icon = '';
            let tooltipText = '';

            if (totalMonths < 3) {
                icon = paymentNotVerifiedIcon; // RED
                tooltipText = 'العميل جديد على المنصة. لا يوجد تاريخ طويل كافٍ للحكم على موثوقيته واستقراره.';
            } else if (totalMonths >= 3 && totalMonths <= 12) {
                icon = proposalsWarningIcon; // YELLOW
                tooltipText = 'العميل لديه أقدمية مقبولة على المنصة، لكنها لا تعتبر فترة طويلة لضمان الاستقرار الكامل.';
            } else if (totalMonths > 12 && totalMonths < 24) {
                icon = paymentVerifiedIcon; // GREEN
                tooltipText = 'عميل مستقر على المنصة لأكثر من عام. مؤشر جيد على الموثوقية.';
            } else if (totalMonths >= 24) {
                icon = paymentVerifiedIcon; // IDEAL GREEN
                tooltipText = 'عميل قديم ومستقر (سنتين أو أكثر). مؤشر قوي جدًا على الموثوقية والخبرة في التعامل على المنصة.';
            }
            
            if (icon) {
                memberSinceIconWithTooltip = `<span class="tooltip-container">${icon}<span class="tooltip-text">${tooltipText}</span></span>`;
            }
        }
    }

    let avgRateIcon = '';
    let avgRateTooltipText = '';
    let avgRateLabel = 'Avg Rate / Hours';
    avgRateValue = 'N/A'; // This is a reassignment

    if (data.avgHourlyRate !== 'N/A') {
        avgRateValue = `${data.avgHourlyRate} / ${data.totalHours}`;
        const rateValue = parseFloat((data.avgHourlyRate || '').replace('$', ''));
        if (rateValue >= 30) {
            avgRateIcon = paymentVerifiedIcon;
            avgRateTooltipText = 'عميل مثالي ويدفع بسخاء مقابل القيمة. فرصة ممتازة.';
        } else if (rateValue > 15) {
            avgRateIcon = paymentVerifiedIcon;
            avgRateTooltipText = 'متوسط سعر الساعة الذي يدفعه العميل جيد جدًا.';
        } else if (rateValue >= 10) {
            avgRateIcon = proposalsWarningIcon;
            avgRateTooltipText = 'متوسط سعر الساعة الذي يدفعه العميل مقبول، لكنه ليس مرتفعًا.';
        } else {
            avgRateIcon = paymentNotVerifiedIcon;
            avgRateTooltipText = 'متوسط سعر الساعة الذي يدفعه العميل منخفض جدًا.';
        }
    } else {
        // Default label remains 'Avg Rate / Hours' unless we find fixed-price jobs
        const fixedPriceJobs = (data.clientHistory || [])
            .map(item => {
                if (item.jobPrice && (item.jobPrice || '').toLowerCase().includes('fixed-price')) {
                    const match = item.jobPrice.match(/\$([\d,]+\.?\d*)/);
                    if (match && match[1]) return parseFloat(match[1].replace(/,/g, ''));
                }
                return null;
            })
            .filter(price => price !== null);

        if (fixedPriceJobs.length > 0) {
            avgRateLabel = 'Avg. Fixed-Price'; // Change the label ONLY here
            const averagePrice = fixedPriceJobs.reduce((a, b) => a + b, 0) / fixedPriceJobs.length;
            avgRateValue = `~$${averagePrice.toFixed(2)}`;
            avgRateIcon = proposalsWarningIcon;
            avgRateTooltipText = 'متوسط السعر الثابت للمشاريع الظاهرة. لمزيد من الدقة، اعرض تاريخ العميل بالكامل.';
        } else {
            // If no hourly and no fixed, keep default label and show N/A
            avgRateValue = 'N/A';
            avgRateIcon = paymentNotVerifiedIcon;
            avgRateTooltipText = 'لا يمكن حساب متوسط السعر. اعرض تاريخ العميل بالكامل على الصفحة ثم أعد فتح الإضافة لتحليل أعمق.';
        }
    }
    let avgRateIconWithTooltip = '';
    if (avgRateIcon) {
        avgRateIconWithTooltip = `<span class="tooltip-container">${avgRateIcon}<span class="tooltip-text">${avgRateTooltipText}</span></span>`;
    }

    let jobAgeIcon = '';
    let jobAgeTooltipText = '';
    const jobAgeLowerCase = (data.postedTime || '').toLowerCase();
    if (jobAgeLowerCase.includes('minute') || jobAgeLowerCase.includes('now') || jobAgeLowerCase.includes('1 hour')) {
        jobAgeIcon = paymentVerifiedIcon;
        jobAgeTooltipText = 'هذه الوظيفة حديثة جدًا، مما يزيد من فرصة أن تكون أول المتقدمين.';
    } else if (jobAgeLowerCase.includes('day ago') || jobAgeLowerCase.includes('days ago')) {
        jobAgeIcon = paymentNotVerifiedIcon;
        jobAgeTooltipText = 'مر على نشر هذه الوظيفة يوم أو أكثر. فرصة التقديم شبه معدومة.';
    } else if (jobAgeLowerCase.includes('week')) {
        jobAgeIcon = paymentNotVerifiedIcon;
        jobAgeTooltipText = 'وظيفة قديمة تم نشرها منذ أسبوع أو أكثر. لا تقدم.';
    } else if (jobAgeLowerCase.includes('month') || jobAgeLowerCase.includes('year')) {
        jobAgeIcon = paymentNotVerifiedIcon;
        jobAgeTooltipText = 'وظيفة قديمة جدًا. على الأغلب تم توظيف شخص بالفعل أو تم إلغاؤها.';
    }

    let jobAgeIconWithTooltip = '';
    if (jobAgeIcon) {
        jobAgeIconWithTooltip = `<span class="tooltip-container">${jobAgeIcon}<span class="tooltip-text">${jobAgeTooltipText}</span></span>`;
    }

    let connectsIcon = '';
    let connectsTooltipText = '';
    const requiredConnectsValue = parseInt(data.connects);
    if (!isNaN(requiredConnectsValue)) {
        if (requiredConnectsValue <= 15) {
            connectsIcon = paymentVerifiedIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة منخفض ومناسب نوعًا ما.';
        } else if (requiredConnectsValue <= 22) {
            connectsIcon = proposalsWarningIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة مرتفع قليلًا.';
        } else {
            connectsIcon = paymentNotVerifiedIcon;
            connectsTooltipText = 'عدد الاتصالات المطلوب لهذه الوظيفة مرتفع للغاية.';
        }
    }
    let connectsIconWithTooltip = '';
    if (connectsIcon) {
        connectsIconWithTooltip = `<span class="tooltip-container">${connectsIcon}<span class="tooltip-text">${connectsTooltipText}</span></span>`;
    }

    let lastViewedHtml = '';
    if (data.lastViewed && data.lastViewed !== 'N/A') {
        lastViewedHtml = `<dt>Last Viewed</dt><dd>${data.lastViewed}</dd>`;
    }

    let budgetIcon = '';
    let budgetTooltipText = '';

    if ((data.jobType || '').toLowerCase().includes('hourly')) {
        let jobRate = 0;
        let isAverage = false;
        const rateNumbers = (data.budgetOrRate || '').match(/\d+\.?\d*/g);
        if (rateNumbers) {
            const rates = rateNumbers.map(n => parseFloat(n));
            if (rates.length > 1) {
                jobRate = (rates[0] + rates[1]) / 2;
                isAverage = true;
            } else if (rates.length === 1) {
                jobRate = rates[0];
            }
        }
        if (jobRate > 0) {
            const userPreferredRate = parseFloat(localStorage.getItem('userPreferredRate')) || 0;
            const evalResult = getHourlyRateEvaluation(jobRate, data.experienceLevel, icons, userPreferredRate, isAverage);
            budgetIcon = evalResult.icon;
            budgetTooltipText = evalResult.tooltip;
        }
    } else if ((data.jobType || '').toLowerCase().includes('fixed-price')) {
        const budgetResult = evaluateFixedPriceBudget(data, icons, userExperience);
        budgetIcon = budgetResult.icon;
        budgetTooltipText = budgetResult.tooltip;
    }

    let budgetIconWithTooltip = '';
    if (budgetIcon) {
        budgetIconWithTooltip = `<span class="tooltip-container">${budgetIcon}<span class="tooltip-text">${budgetTooltipText}</span></span>`;
    }

    let invitesSentHtml = '';
    if (data.invitesSent && data.invitesSent !== 'N/A' && parseInt(data.invitesSent) > 0) {
        const invitesCount = parseInt(data.invitesSent);
        let invitesSentIconWithTooltip = '';
        let icon = '';
        let tooltipText = '';

        if (invitesCount >= 18) {
            icon = paymentNotVerifiedIcon; // RED
            tooltipText = 'العميل يرسل دعوات كثيرة جدًا، قد يكون عشوائيًا في اختياراته.';
                        } else if (invitesCount >= 10) {
                            icon = proposalsWarningIcon; // YELLOW
                            tooltipText = 'العميل قد لا يكون يعرف ما يريد ويرسل دعوات عشوائية، كن حذرًا.';
                        }
        if (icon) {
            invitesSentIconWithTooltip = `<span class="tooltip-container">${icon}<span class="tooltip-text">${tooltipText}</span></span>`;
        }
        
        // Build the full HTML for the list item
        invitesSentHtml = `<dt>Invites Sent</dt><dd>${data.invitesSent} ${invitesSentIconWithTooltip}</dd>`;
    }

                    let hiresHtml = '';
                    if (data.hires && data.hires !== 'N/A' && parseInt(data.hires) > 0) {
                        const hiresCount = parseInt(data.hires);
                        const tooltipText = 'انتهى الأمر. تم توظيف شخص بالفعل لهذه الوظيفة. لا تقدم واذهب للبحث عن وظيفة أخرى.';
                        const hiresIconWithTooltip = `<span class="tooltip-container">${paymentNotVerifiedIcon}<span class="tooltip-text">${tooltipText}</span></span>`;
                        hiresHtml = `<dt>Hires</dt><dd>${hiresCount} ${hiresIconWithTooltip}</dd>`;
                    } else if (data.hires && data.hires !== 'N/A') {
                        // Handles the case where Hires is 0
                        hiresHtml = `<dt>Hires</dt><dd>${data.hires}</dd>`;
                    }
    let experienceIcon = '';
    let experienceTooltipText = '';
    const jobExperience = (data.experienceLevel || '').toLowerCase();

    if (userExperience) {
        if (userExperience === 'Entry') {
            if (jobExperience.includes('expert')) {
                experienceIcon = paymentNotVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (مبتدئ) أقل بكثير من المطلوب (خبير).';
            } else if (jobExperience.includes('intermediate')) {
                experienceIcon = proposalsWarningIcon;
                experienceTooltipText = 'مستوى خبرتك (مبتدئ) أقل من المطلوب (متوسط).';
            } else {
                experienceIcon = paymentVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (مبتدئ) يتطابق مع المطلوب.';
            }
        } else if (userExperience === 'Intermediate') {
            if (jobExperience.includes('expert')) {
                experienceIcon = proposalsWarningIcon;
                experienceTooltipText = 'مستوى خبرتك (متوسط) أقل من المطلوب (خبير).';
            } else if (jobExperience.includes('intermediate')) {
                experienceIcon = paymentVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (متوسط) يتطابق مع المطلوب.';
            } else {
                experienceIcon = paymentVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (متوسط) يتجاوز المطلوب (مبتدئ).';
            }
        } else if (userExperience === 'Expert') {
            if (jobExperience.includes('expert')) {
                experienceIcon = paymentVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (خبير) يتطابق مع المطلوب.';
            } else {
                experienceIcon = paymentVerifiedIcon;
                experienceTooltipText = 'مستوى خبرتك (خبير) يتجاوز المطلوب.';
            }
        }
    }

    let experienceIconWithTooltip = '';
    if (experienceIcon) {
        experienceIconWithTooltip = `<span class="tooltip-container">${experienceIcon}<span class="tooltip-text">${experienceTooltipText}</span></span>`;
    }

    const userJobTypePreference = localStorage.getItem('userJobTypePreference');
    let jobTypeIcon = '';
    let jobTypeTooltip = '';

    if (userJobTypePreference && userJobTypePreference !== 'Whatever') {
        const jobIsHourly = (data.jobType || '').toLowerCase().includes('hourly');
        const jobIsFixed = (data.jobType || '').toLowerCase().includes('fixed-price');

        if (userJobTypePreference === 'Hourly' && jobIsFixed) {
            jobTypeIcon = icons.proposalsWarningIcon;
            jobTypeTooltip = 'هذه وظيفة بسعر ثابت، لكنك تفضل العمل بالساعة.';
        } else if (userJobTypePreference === 'Fixed-price' && jobIsHourly) {
            jobTypeIcon = icons.proposalsWarningIcon;
            jobTypeTooltip = 'هذه وظيفة بالساعة، لكنك تفضل العمل بسعر ثابت.';
        } else if (userJobTypePreference === 'Hourly' && jobIsHourly) {
            jobTypeIcon = icons.paymentVerifiedIcon;
            jobTypeTooltip = 'هذه الوظيفة تتوافق مع تفضيلك للعمل بالساعة.';
        } else if (userJobTypePreference === 'Fixed-price' && jobIsFixed) {
            jobTypeIcon = icons.paymentVerifiedIcon;
            jobTypeTooltip = 'هذه الوظيفة تتوافق مع تفضيلك للعمل بسعر ثابت.';
        }
    }

    let jobTypeIconWithTooltip = '';
    if (jobTypeIcon) {
        jobTypeIconWithTooltip = `<span class="tooltip-container">${jobTypeIcon}<span class="tooltip-text">${jobTypeTooltip}</span></span>`;
    }

    let mismatchesHtml = '';
    if (data.qualificationMismatches && data.qualificationMismatches.length > 0) {
      const mismatchItems = data.qualificationMismatches.map(item => 
        `<li class="mismatch-item">${item}</li>`
      ).join('');
      mismatchesHtml = `
        <div class="data-section mismatch-section">
          <h3><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: -3px; margin-right: 8px;"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>Mismatched Qualifications</h3>
          <ul class="mismatch-list">
            ${mismatchItems}
          </ul>
        </div>
      `;
    }

    analysisResultsDiv.innerHTML = `
      <div class="data-section">
        <h3>Job Details</h3>
        <dl>
          <dt>Title</dt><dd>${data.jobTitle || 'N/A'}</dd>
          <dt>Type</dt><dd>${data.jobType || 'N/A'} ${jobTypeIconWithTooltip}</dd>
          <dt>Budget / Rate</dt><dd>${data.budgetOrRate || 'N/A'} ${budgetIconWithTooltip}</dd>
          <dt>Experience</dt><dd>${data.experienceLevel || 'N/A'} ${experienceIconWithTooltip}</dd>
          <dt>Connects</dt><dd>Required: ${data.connects || 'N/A'} / Available: ${data.availableConnects || 'N/A'} ${connectsIconWithTooltip}</dd>
          <dt class="separator" colspan="2"></dt>
          <dt>Posted</dt><dd>${data.postedTime || 'N/A'} ${jobAgeIconWithTooltip}</dd>
          ${lastViewedHtml}
          <dt>Proposals</dt><dd>${data.proposals || 'N/A'} ${proposalsIconWithTooltip}</dd>
          <dt>Interviewing</dt><dd>${data.interviewing || 'N/A'}</dd>
          ${invitesSentHtml}
          ${hiresHtml}
        </dl>
        ${mismatchesHtml}
        <h4>Full Job Description</h4>
        <div class="description-box">
          <p id="full-description">${data.fullJobDescription || 'N/A'}</p>
        </div>
      </div>

      <div class="data-section">
        <div class="section-header">
          <h3>Client Details</h3>
          <div class="${scoreDisplayClass}">
            ${scoreStatusIconHtml}
            <span class="score-value">${clientScore}</span>
            <span class="score-base">/ 10</span>
            ${scoreTooltipHtml}
          </div>
        </div>
        <dl>
          <dt>Payment Verified</dt><dd>${paymentVerifiedIconWithTooltip} ${data.paymentVerified}</dd>
          <dt>Rating</dt><dd>${starRating} ${data.rating} (${data.reviewsCount}) ${clientRatingIconWithTooltip}</dd>
          <dt>Location</dt><dd>${data.location || 'N/A'}</dd>
          <dt>Total Spent</dt><dd>${data.totalSpent || 'N/A'} ${totalSpentIconWithTooltip}</dd>
          <dt>Jobs Posted</dt><dd>${data.jobsPosted || 'N/A'} ${jobsPostedIconWithTooltip}</dd>
          <dt>Hire Rate</dt><dd>${data.hireRate || 'N/A'} (${data.openJobs || 'N/A'} open) ${hireRateIconWithTooltip}</dd>
          <dt>${avgRateLabel}</dt><dd>${avgRateValue} ${avgRateIconWithTooltip}</dd>
          <dt>Member Since</dt><dd>${data.memberSince || 'N/A'} ${memberSinceIconWithTooltip}</dd>
        </dl>
        <h4>Client Recent History (${(data.clientHistory || []).length})</h4>
        <div class="history-container">
          ${historyHtml || '<p>No recent history found.</p>'}
        </div>
      </div>
    `;
  }

        

                        function evaluateFixedPriceBudget(data, icons, userExperience) {
                    

                          const actualBudget = parseMoney(data.budgetOrRate);

                          const avgRateValue = parseMoney(data.avgHourlyRate);

            

                          // --- Priority 1: Suspicious High Budget / Low Avg Rate ---

                          if (actualBudget >= 2500 && avgRateValue > 0 && avgRateValue <= 15) {

                              return {

                                  icon: icons.proposalsWarningIcon,

                                  tooltip: '<strong>الميزانية مرتفعة جدًا مقارنة بمتوسط سعر الساعة الذي يدفعه العميل عادةً، قد يكون الأمر مريبًا.</strong> تحقق من مدة المشروع.'

                              };

                          }

            

                          // --- Priority 2: Deadline-based Logic ---

                          if (data.jobDeadline && data.jobDeadline !== 'N/A') {

                    

                              let durationDays = 0;

                    

                              try {

                    

                                  const deadlineDate = new Date(data.jobDeadline);

                    

                                  const today = new Date();

                    

                                  deadlineDate.setHours(0, 0, 0, 0);

                    

                                  today.setHours(0, 0, 0, 0);

                    

                                  const diffTime = deadlineDate - today;

                    

                                  durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    

                                  if (durationDays <= 0) {

                    

                                      durationDays = 1; // If due today or in the past, treat as a 1-day project.

                    

                                  }

                    

                              } catch (e) {

                    

                                  durationDays = 0; // On error, ensure we don't proceed with this check.

                    

                              }

                    

                          

                    

                              if (durationDays > 0) {

            

                                  // --- Sub-priority A: User Experience Override for Long Deadlines ---

                                  if (durationDays > 30) { // "Far" deadline

                                      if (userExperience === 'Entry') {

                                          return {

                                              icon: icons.paymentVerifiedIcon, // GREEN

                                              tooltip: 'الموعد النهائي بعيد، مما يجعله مناسبًا لمستوى خبرتك كمبتدئ.'

                                          };

                                      }

                                      if (userExperience === 'Intermediate') {

                                          return {

                                              icon: icons.proposalsWarningIcon, // YELLOW

                                              tooltip: 'الموعد النهائي بعيد، لكن انتبه فقد تكون الميزانية غير كافية لمستوى خبرتك المتوسط.'

                                          };

                                      }

                                  }

                    

                                  // --- Sub-priority B: Implied Rate Calculation (Fallback) ---

                                  let dailyHours = 4; // Default

                    

                                  const totalHours = durationDays * dailyHours;

                    

                                  if (totalHours > 0) {

                    

                                      const impliedRate = actualBudget / totalHours;

                    

                                      const evalResult = getHourlyRateEvaluation(impliedRate, data.experienceLevel, icons);

                                      const contextText = "هذا التقييم يفترض أنك تعمل 4 ساعات يوميًا بناءً على مدة المشروع.";
                                      const modifiedTooltip = evalResult.tooltip.replace('المعدل للساعة', 'السعر');
                                      let finalTooltip = modifiedTooltip;

            

                                      if (evalResult.icon === icons.paymentVerifiedIcon) {

                                          finalTooltip = `<strong>الميزانية تبدو ممتازة.</strong> ${contextText}`;

                                      } else if (evalResult.icon === icons.proposalsWarningIcon) {

                                          finalTooltip = `<strong>الميزانية تبدو مقبولة.</strong> ${contextText}`;

                                      } else if (evalResult.icon === icons.paymentNotVerifiedIcon) {

                                          finalTooltip = `<strong>${modifiedTooltip}</strong> ${contextText}`;

                                      }

                    

                                      return { icon: evalResult.icon, tooltip: finalTooltip };

                    

                                  }

                    

                              }

                    

                          }

                    

                      

                    

                          // --- Priority 3: Simple High Budget (if other checks failed) ---

                          if (actualBudget >= 1000) {

                    

                              return {

                    

                                  icon: icons.paymentVerifiedIcon,

                    

                                  tooltip: 'سعر الوظيفة مرتفع وممتاز، ولكن تأكد من المدة الزمنية للمشروع'

                    

                              };

                    

                          }

            

                                        // If all checks fail, do nothing.

            

                                  

            

                                        return { icon: '', tooltip: '' };

            

                                  

            

                                      }

        

          function getHourlyRateEvaluation(rate, experienceLevel, icons, userPreferredRate, isAverage) {
            const baseEval = performBaseRateEvaluation(rate, experienceLevel, icons);
            const { paymentVerifiedIcon, proposalsWarningIcon } = icons;
            const prefix = isAverage ? 'متوسط ' : '';

            if (userPreferredRate && userPreferredRate > 0) {
                if (rate >= userPreferredRate) {
                    if (baseEval.icon === paymentVerifiedIcon) {
                        return { 
                            icon: baseEval.icon, 
                            tooltip: baseEval.tooltip + ' وهو ايضا ما تبحث عنه.' 
                        };
                    } else {
                        return { 
                            icon: paymentVerifiedIcon, 
                            tooltip: `${prefix}سعر الساعة في هذه الوظيفة (${rate}$) يطابق أو يتجاوز السعر الذي تفضله.`
                        };
                    }
                } else {
                    return { 
                        icon: proposalsWarningIcon, 
                        tooltip: `${prefix}معدل الساعة المقترح (${rate}$) أقل من السعر المفضل لديك (${userPreferredRate}$).`
                    };
                }
            }
            return baseEval;
          }

          function performBaseRateEvaluation(rate, experienceLevel, icons) {
            const { paymentVerifiedIcon, proposalsWarningIcon, paymentNotVerifiedIcon } = icons;
            const isExpert = experienceLevel.toLowerCase().includes('expert');
            let icon = '';
            let tooltip = '';

            if (rate < 10) { // Priority 1: Very Low Rate (always red)
                icon = paymentNotVerifiedIcon;
                tooltip = 'يعتبر هذا المعدل للساعة منخفضًا جدًا.';
            } else if (rate <= 15) { // Priority 2: Mediocre Rate (always yellow)
                icon = proposalsWarningIcon;
                tooltip = 'يعتبر هذا المعدل للساعة متوسطًا.';
            } else if (rate <= 20 && isExpert) { // Priority 3: Low for an Expert (yellow)
                icon = proposalsWarningIcon;
                tooltip = 'يعتبر هذا المعدل للساعة مقبولاً، ولكنه منخفض لوظيفة تتطلب مستوى خبير.';
            } else if (rate > 20 && rate < 30) { // Good Rate
                icon = paymentVerifiedIcon;
                tooltip = 'يعتبر هذا المعدل للساعة جيدًا.';
            } else if (rate >= 30) { // Excellent Rate
                icon = paymentVerifiedIcon;
                tooltip = 'يعتبر هذا المعدل للساعة ممتازًا للغاية.';
            } else { // Default case for rates between 15 and 20 for non-experts, which is good.
                icon = paymentVerifiedIcon;
                tooltip = 'يعتبر هذا المعدل للساعة جيدًا.';
            }
            
            return { icon, tooltip };
          }





  function setupButtons(data) {
    const copyBtn = document.getElementById('copy-all-btn');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtnTextSpan = copyBtn.querySelector('span');
    const copyBtnIcon = copyBtn.querySelector('svg');

    const fullText = generateFullText(data);

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullText).then(() => {
        if (copyBtnTextSpan && copyBtnIcon) {
          copyBtnIcon.style.display = 'none';
          copyBtnTextSpan.textContent = 'Copied!';
        }
        setTimeout(() => {
          if (copyBtnTextSpan && copyBtnIcon) {
            copyBtnIcon.style.display = 'inline';
            copyBtnTextSpan.textContent = 'Copy All';
          }
        }, 2000);
      });
    });

    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([fullText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.jobTitle.replace(/[^a-z0-9]/gi, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  
  function generateFullText(data) {
      let historyText = (data.clientHistory || []).map(item => 
`Project: ${item.projectTitle || 'N/A'}
  - Date: ${item.jobDate || 'N/A'}
  - Price: ${item.jobPrice || 'N/A'}
  - Feedback to Client: ${item.freelancerFeedback || 'N/A'}
  - Feedback from Client: ${item.clientFeedback || 'N/A'}`
      ).join('\n\n');

      if (!historyText) {
        historyText = 'No history available.';
      }

      return `--- JOB DETAILS ---
Job Title: ${data.jobTitle || 'N/A'}
Job Type: ${data.jobType || 'N/A'}
Budget / Rate: ${data.budgetOrRate || 'N/A'}
Deadline: ${data.jobDeadline || 'N/A'}
Experience Level: ${data.experienceLevel || 'N/A'}
Connects: ${data.connects || 'N/A'}
Posted: ${data.postedTime || 'N/A'}
Last Viewed: ${data.lastViewed || 'N/A'}
Proposals: ${data.proposals || 'N/A'}
Interviewing: ${data.interviewing || 'N/A'}
Invites Sent: ${data.invitesSent || 'N/A'}
Hires: ${data.hires || 'N/A'}

--- CLIENT DETAILS ---
Payment Verified: ${data.paymentVerified ? 'Yes' : 'No'}
Rating: ${data.rating || 'N/A'}
Location: ${data.location || 'N/A'}
Total Spent: ${data.totalSpent || 'N/A'}
Avg Hourly Rate: ${data.avgHourlyRate || 'N/A'}
Total Hours: ${data.totalHours || 'N/A'}
Jobs Posted: ${data.jobsPosted || 'N/A'}
Hire Rate: ${data.hireRate || 'N/A'}
Member Since: ${data.memberSince || 'N/A'}

--- FULL JOB DESCRIPTION ---
${data.fullJobDescription || 'N/A'}

--- CLIENT RECENT HISTORY ---
${historyText}
`;
  }

  // --- Profile Modal Logic ---
  const experienceRadios = document.querySelectorAll('input[name="experienceLevel"]');

  // Load saved experience level
  const savedExperience = localStorage.getItem('userExperienceLevel');
  if (savedExperience) {
    const radioToCheck = document.querySelector(`input[name="experienceLevel"][value="${savedExperience}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
    }
  }

  // Save experience level on change
  experienceRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
      localStorage.setItem('userExperienceLevel', event.target.value);
    });
  });

  // --- Job Type Preference Logic ---
  const jobTypeRadios = document.querySelectorAll('input[name="jobTypePreference"]');
  
  // Load saved job type preference
  const savedJobType = localStorage.getItem('userJobTypePreference');
  if (savedJobType) {
    const radioToCheck = document.querySelector(`input[name="jobTypePreference"][value="${savedJobType}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
    }
  }

  // Save job type preference on change
  jobTypeRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
      localStorage.setItem('userJobTypePreference', event.target.value);
    });
  });

  // --- Preferred Rate Logic ---
  const preferredRateInput = document.getElementById('preferred-rate');
  const clearRateBtn = document.getElementById('clear-rate-btn');

  // Function to show/hide clear button based on input value
  const toggleClearRateButton = () => {
    if (preferredRateInput.value) {
      clearRateBtn.style.display = 'block';
    } else {
      clearRateBtn.style.display = 'none';
    }
  };

  // Load saved preferred rate and set initial button visibility
  const savedPreferredRate = localStorage.getItem('userPreferredRate');
  if (savedPreferredRate) {
    preferredRateInput.value = savedPreferredRate;
  }
  toggleClearRateButton(); // Set initial state

  // Save preferred rate and validate input
  preferredRateInput.addEventListener('input', (event) => {
    // Allow only numbers and one decimal point
    let value = event.target.value;
    value = value.replace(/[^0-9.]/g, ''); // Remove non-numeric/non-dot characters
    const parts = value.split('.');
    if (parts.length > 2) { // If more than one dot
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    event.target.value = value;
    
    localStorage.setItem('userPreferredRate', value);
    toggleClearRateButton();
  });

  // Clear preferred rate
  clearRateBtn.addEventListener('click', () => {
    localStorage.removeItem('userPreferredRate');
    preferredRateInput.value = '';
    toggleClearRateButton();
    preferredRateInput.focus(); // For better UX
  });

  // --- Clear Selections Logic ---
  const clearProfileBtn = document.getElementById('clear-profile-btn');
  clearProfileBtn.addEventListener('click', () => {
    // Clear from localStorage
    localStorage.removeItem('userExperienceLevel');
    localStorage.removeItem('userJobTypePreference');
    localStorage.removeItem('userPreferredRate');

    // Uncheck all radio buttons
    const allRadios = document.querySelectorAll('#profile-modal input[type="radio"]');
    allRadios.forEach(radio => {
      radio.checked = false;
    });

    // Clear the rate input
    preferredRateInput.value = '';
    toggleClearRateButton();
  });

});