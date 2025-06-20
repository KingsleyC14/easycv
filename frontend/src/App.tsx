import { useState } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [jobSpecFile, setJobSpecFile] = useState<File | null>(null)
  const [jobSpecTextInput, setJobSpecTextInput] = useState<string>('')
  const [tailoredCv, setTailoredCv] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setCvFile(e.target.files[0])
    }
  }

  const handleJobSpecFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setJobSpecFile(e.target.files[0])
      setJobSpecTextInput('') // Clear text input if file is selected
    }
  }

  const handleJobSpecTextInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJobSpecTextInput(e.target.value)
    setJobSpecFile(null) // Clear file input if text is entered
  }

  const handleUpload = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    if (!cvFile) {
      setError('Please upload your CV.')
      setLoading(false)
      return
    }

    if (!jobSpecFile && !jobSpecTextInput) {
      setError('Please upload a job spec file or paste job spec text.')
      setLoading(false)
      return
    }

    const formData = new FormData()
    formData.append('cv', cvFile)
    if (jobSpecFile) {
      formData.append('job_spec', jobSpecFile)
    } else if (jobSpecTextInput) {
      formData.append('job_spec_text_input', jobSpecTextInput)
    }

    try {
      const response = await axios.post('http://localhost:5000/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      setMessage(response.data.message)
      setSubmissionId(response.data.data[0].id) // Assuming the backend returns the submission ID
      setTailoredCv(null) // Clear previous tailored CV
    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.response?.data?.error || 'Failed to upload files.')
    } finally {
      setLoading(false)
    }
  }

  const handleTailorCv = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)

    if (!submissionId) {
      setError('Please upload your CV and job spec first.')
      setLoading(false)
      return
    }

    try {
      // Request the PDF directly from the backend
      const response = await axios.post(`http://localhost:5000/tailor-cv`, {
        submissionId,
        // originalCvContent and jobSpecContent are now fetched on backend
      }, {
        responseType: 'blob' // Important: expect a binary response
      })

      // Create a blob from the response data
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const downloadUrl = window.URL.createObjectURL(blob)

      // Create a link element and trigger the download
      const link = document.createElement('a')
      link.href = downloadUrl
      link.setAttribute('download', 'tailored_cv.pdf') // Set the download filename
      document.body.appendChild(link)
      link.click()

      // Clean up
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setMessage('CV tailored and PDF downloaded successfully!')
      setTailoredCv(null) // Clear previous tailored CV display

    } catch (err: any) {
      console.error('Tailor CV error:', err)
      setError(err.response?.data?.error || 'Failed to tailor CV and download PDF.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyTailoredCv = () => {
    if (tailoredCv) {
      navigator.clipboard.writeText(tailoredCv)
      alert('Tailored CV copied to clipboard!')
    }
  }

  // For download, you would typically generate a file on the backend and provide a download URL.
  // For now, we'll just show an alert.
  const handleDownloadTailoredCv = () => {
    if (tailoredCv) {
      const element = document.createElement("a")
      const file = new Blob([tailoredCv], { type: 'text/plain' })
      element.href = URL.createObjectURL(file)
      element.download = "tailored_cv.txt"
      document.body.appendChild(element) // Required for Firefox
      element.click()
      document.body.removeChild(element) // Clean up
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">EasyCV Tailor</h1>

        {message && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">{message}</div>}
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

        <div className="mb-6">
          <label htmlFor="cv-upload" className="block text-gray-700 text-sm font-bold mb-2">1. Upload Original CV (PDF or DOCX)</label>
          <input
            type="file"
            id="cv-upload"
            accept=".pdf,.doc,.docx"
            onChange={handleCvFileChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">2. Provide Job Specification</label>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="job-spec-file-upload" className="block text-gray-600 text-xs mb-1">Upload Job Spec File (PDF, DOCX, or Image)</label>
              <input
                type="file"
                id="job-spec-file-upload"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleJobSpecFileChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="job-spec-text-area" className="block text-gray-600 text-xs mb-1">Or Paste Job Spec Text</label>
              <textarea
                id="job-spec-text-area"
                rows={6}
                value={jobSpecTextInput}
                onChange={handleJobSpecTextInputChange}
                placeholder="Paste the job description here..."
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline resize-y"
              ></textarea>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full mb-4 disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload Files'}
        </button>

        {submissionId && (
          <button
            onClick={handleTailorCv}
            disabled={loading}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full mb-4 disabled:opacity-50"
          >
            {loading ? 'Tailoring...' : 'Tailor CV'}
          </button>
        )}

        {tailoredCv && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Tailored CV Result</h2>
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mb-4 whitespace-pre-wrap">
              {tailoredCv}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCopyTailoredCv}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Copy
              </button>
              <button
                onClick={handleDownloadTailoredCv}
                className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Download
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
