
document.addEventListener('DOMContentLoaded', () => {
  const analysisResultsDiv = document.getElementById('analysis-results');

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
        } else {
          analysisResultsDiv.innerHTML = '<p class="error">Failed to retrieve job data. The page structure might have changed.</p>';
        }
      });
    });
  });

  function renderJobData(data) {
    let historyHtml = data.clientHistory.map(item => `
      <div class="history-item">
        <strong>${item.projectTitle || 'N/A'}</strong>
        <p><em>Feedback to Client:</em> ${item.freelancerFeedback || 'N/A'}</p>
        <p><em>Feedback from Client:</em> ${item.clientFeedback || 'N/A'}</p>
      </div>
    `).join('');

    analysisResultsDiv.innerHTML = `
      <div class="data-section">
        <h3>Job Details</h3>
        <dl>
          <dt>Title</dt><dd>${data.jobTitle}</dd>
          <dt>Type</dt><dd>${data.jobType}</dd>
          <dt>Budget / Rate</dt><dd>${data.budgetOrRate}</dd>
          <dt>Experience</dt><dd>${data.experienceLevel}</dd>
          <dt class="separator" colspan="2"></dt>
          <dt>Posted</dt><dd>${data.jobAge}</dd>
          <dt>Last Viewed</dt><dd>${data.lastViewed}</dd>
          <dt>Proposals</dt><dd>${data.proposalsCount}</dd>
          <dt>Interviewing</dt><dd>${data.interviewing}</dd>
          <dt>Invites Sent</dt><dd>${data.invitesSent}</dd>
          <dt>Hires</dt><dd>${data.hires} ${parseInt(data.hires) > 0 ? '❌' : ''}</dd>
        </dl>
        <h4>Full Job Description</h4>
        <div class="description-box">
          <p id="full-description">${data.fullJobDescription}</p>
        </div>
      </div>

      <div class="data-section">
        <h3>Client Details</h3>
        <dl>
          <dt>Payment Verified</dt><dd>${data.paymentVerified}</dd>
          <dt>Rating</dt><dd>${data.clientRating} (${data.clientReviewsCount})</dd>
          <dt>Location</dt><dd>${data.clientLocation}</dd>
          <dt>Total Spent</dt><dd>${data.totalSpent}</dd>
          <dt>Jobs Posted</dt><dd>${data.clientJobsPosted}</dd>
          <dt>Hire Rate</dt><dd>${data.clientHireRate} (${data.openJobs} open)</dd>
          <dt>Member Since</dt><dd>${data.clientJoinDate}</dd>
        </dl>
        <h4>Client Recent History (${data.clientHistory.length})</h4>
        <div class="history-container">
          ${historyHtml || '<p>No recent history found.</p>'}
        </div>
      </div>
    `;

    setupButtons(data);
  }

  function setupButtons(data) {
    const copyBtn = document.getElementById('copy-all-btn');
    const downloadBtn = document.getElementById('download-btn');

    const fullText = generateFullText(data);

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullText).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 2000);
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
      let historyText = data.clientHistory.map(item => 
`Project: ${item.projectTitle}
  - Feedback to Client: ${item.freelancerFeedback}
  - Feedback from Client: ${item.clientFeedback}`
      ).join('\n\n');

      return 
`
--- JOB DETAILS ---
Job Title: ${data.jobTitle}
Job Type: ${data.jobType}
Budget / Rate: ${data.budgetOrRate}
Experience Level: ${data.experienceLevel}
Posted: ${data.jobAge}
Last Viewed: ${data.lastViewed}
Proposals: ${data.proposalsCount}
Interviewing: ${data.interviewing}
Invites Sent: ${data.invitesSent}
Hires: ${data.hires}

--- CLIENT DETAILS ---
Payment Verified: ${data.paymentVerified}
Rating: ${data.clientRating} (${data.clientReviewsCount})
Location: ${data.clientLocation}
Total Spent: ${data.totalSpent}
Jobs Posted: ${data.clientJobsPosted}
Hire Rate: ${data.clientHireRate} (${data.openJobs} open)
Member Since: ${data.clientJoinDate}

--- FULL JOB DESCRIPTION ---
${data.fullJobDescription}

--- CLIENT RECENT HISTORY ---
${historyText}
`
  }

});
