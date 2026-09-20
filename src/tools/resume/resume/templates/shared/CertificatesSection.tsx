import React from 'react'
import type { Certificate } from '../../types'

interface CertificatesSectionProps {
  certificates: Certificate[]
}

const CertificatesSection: React.FC<CertificatesSectionProps> = ({ certificates }) => {
  if (!certificates || certificates.length === 0) return null

  return (
    <div className="mt-2 flex w-full flex-wrap gap-2">
      {certificates.map((cert) => (
        <div
          key={cert.id}
          style={{ width: `calc(${cert.width}% - 8px)` }}
          className="flex max-w-full justify-center"
        >
          <img src={cert.url} alt="Certificate" className="h-auto w-full object-contain" />
        </div>
      ))}
    </div>
  )
}

export default CertificatesSection
