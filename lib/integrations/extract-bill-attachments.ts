import { ContentInfo, SignedData } from 'pkijs';
import { extractText } from 'unpdf';

type GraphAttachment = {
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
};

type GraphAttachmentsResponse = {
  value?: GraphAttachment[];
};

function concatenateUint8Arrays(
  arrays: Uint8Array[]
): Uint8Array {
  const totalLength = arrays.reduce(
    (sum, array) => sum + array.length,
    0
  );

  const result = new Uint8Array(totalLength);

  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

function readAsn1OctetString(node: any): Uint8Array {
  const valueHexView =
    node?.valueBlock?.valueHexView;

  if (
    valueHexView &&
    valueHexView.byteLength > 0
  ) {
    return new Uint8Array(
      valueHexView.buffer,
      valueHexView.byteOffset,
      valueHexView.byteLength
    );
  }

  const valueHex =
    node?.valueBlock?.valueHex;

  if (
    valueHex instanceof ArrayBuffer &&
    valueHex.byteLength > 0
  ) {
    return new Uint8Array(valueHex);
  }

  const children =
    node?.valueBlock?.value;

  if (Array.isArray(children)) {
    const parts = children
      .map((child) =>
        readAsn1OctetString(child)
      )
      .filter(
        (part) => part.length > 0
      );

    if (parts.length > 0) {
      return concatenateUint8Arrays(
        parts
      );
    }
  }

  return new Uint8Array();
}

function extractMimeFromP7m(
  p7mBuffer: Buffer
): string {
  const cmsBuffer =
    p7mBuffer.buffer.slice(
      p7mBuffer.byteOffset,
      p7mBuffer.byteOffset +
        p7mBuffer.byteLength
    ) as ArrayBuffer;

  const cms =
    ContentInfo.fromBER(cmsBuffer);

  if (
    cms.contentType !==
    ContentInfo.SIGNED_DATA
  ) {
    throw new Error(
      'O anexo P7M não contém CMS SignedData.'
    );
  }

  const signedData =
    new SignedData({
      schema: cms.content,
    });

  const eContent =
    signedData.encapContentInfo
      .eContent;

  if (!eContent) {
    throw new Error(
      'O P7M não possui conteúdo encapsulado.'
    );
  }

  const mimeBytes =
    readAsn1OctetString(eContent);

  if (mimeBytes.length === 0) {
    throw new Error(
      'Não foi possível extrair o conteúdo MIME do P7M.'
    );
  }

  return Buffer.from(
    mimeBytes
  ).toString('utf8');
}

function extractPdfBuffersFromMime(
  mimeText: string
): Buffer[] {
  const pdfs: Buffer[] = [];

  const contentTypeRegex =
    /Content-Type:\s*application\/pdf\b/gi;

  let match:
    | RegExpExecArray
    | null;

  while (
    (
      match =
        contentTypeRegex.exec(
          mimeText
        )
    ) !== null
  ) {
    const headerStart =
      match.index;

    const bodyStartCrLf =
      mimeText.indexOf(
        '\r\n\r\n',
        headerStart
      );

    const bodyStartLf =
      mimeText.indexOf(
        '\n\n',
        headerStart
      );

    let bodyStart = -1;
    let separatorLength = 0;

    if (
      bodyStartCrLf !== -1 &&
      (
        bodyStartLf === -1 ||
        bodyStartCrLf <=
          bodyStartLf
      )
    ) {
      bodyStart =
        bodyStartCrLf;
      separatorLength = 4;
    } else if (
      bodyStartLf !== -1
    ) {
      bodyStart =
        bodyStartLf;
      separatorLength = 2;
    }

    if (bodyStart === -1) {
      continue;
    }

    const headers =
      mimeText.slice(
        headerStart,
        bodyStart
      );

    if (
      !/Content-Transfer-Encoding:\s*base64/i.test(
        headers
      )
    ) {
      continue;
    }

    const contentStart =
      bodyStart +
      separatorLength;

    const remaining =
      mimeText.slice(
        contentStart
      );

    const boundaryMatch =
      remaining.match(
        /\r?\n--[^\r\n]+/
      );

    const contentEnd =
      boundaryMatch?.index ??
      remaining.length;

    const base64 =
      remaining
        .slice(
          0,
          contentEnd
        )
        .replace(/\s/g, '');

    if (!base64) {
      continue;
    }

    const pdf =
      Buffer.from(
        base64,
        'base64'
      );

    if (
      pdf
        .subarray(0, 5)
        .toString() ===
      '%PDF-'
    ) {
      pdfs.push(pdf);
    }
  }

  return pdfs;
}

async function extractTextFromPdf(
  pdfBuffer: Buffer
): Promise<string> {
  const result =
    await extractText(
      new Uint8Array(
        pdfBuffer
      ),
      {
        mergePages: true,
      }
    );

  return result.text;
}

async function fetchAttachments(
  messageId: string,
  accessToken: string
): Promise<GraphAttachment[]> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
      messageId
    )}/attachments`
  );

  url.searchParams.set(
    '$select',
    'id,name,contentType,size,isInline'
  );

  const response =
    await fetch(
      url.toString(),
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          Accept:
            'application/json',
        },
        cache: 'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      `Não foi possível consultar os anexos. HTTP ${response.status}`
    );
  }

  const payload =
    (await response.json()) as
      GraphAttachmentsResponse;

  return payload.value ?? [];
}

async function fetchAttachmentContent(
  messageId: string,
  attachmentId: string,
  accessToken: string
): Promise<Buffer> {
  const url =
    `https://graph.microsoft.com/v1.0/me/messages/` +
    `${encodeURIComponent(
      messageId
    )}/attachments/` +
    `${encodeURIComponent(
      attachmentId
    )}/$value`;

  const response =
    await fetch(url, {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

  if (!response.ok) {
    throw new Error(
      `Não foi possível baixar o anexo. HTTP ${response.status}`
    );
  }

  return Buffer.from(
    await response.arrayBuffer()
  );
}

export async function extractFinancialTextFromAttachments(
  messageId: string,
  accessToken: string
): Promise<string> {
  const attachments =
    await fetchAttachments(
      messageId,
      accessToken
    );

  const texts: string[] = [];

  for (const attachment of attachments) {
    if (
      !attachment.id ||
      attachment.isInline
    ) {
      continue;
    }

    const name =
      attachment.name
        ?.toLowerCase() ?? '';

    const type =
      attachment.contentType
        ?.toLowerCase() ?? '';

    try {
      const content =
        await fetchAttachmentContent(
          messageId,
          attachment.id,
          accessToken
        );

      if (
        type ===
          'application/pdf' ||
        name.endsWith('.pdf')
      ) {
        const pdfText =
          await extractTextFromPdf(
            content
          );

        if (pdfText.trim()) {
          texts.push(pdfText);
        }

        continue;
      }

      if (
        type.includes(
          'application/pkcs7-mime'
        ) ||
        name.endsWith('.p7m')
      ) {
        const mimeText =
          extractMimeFromP7m(
            content
          );

        const pdfs =
          extractPdfBuffersFromMime(
            mimeText
          );

        for (
          const pdf of pdfs
        ) {
          const pdfText =
            await extractTextFromPdf(
              pdf
            );

          if (pdfText.trim()) {
            texts.push(pdfText);
          }
        }
      }
    } catch (error) {
      console.error(
        `Erro ao processar anexo ${attachment.name ?? 'sem nome'}:`,
        error instanceof Error
          ? error.message
          : 'Erro desconhecido'
      );
    }
  }

  return texts.join('\n');
}