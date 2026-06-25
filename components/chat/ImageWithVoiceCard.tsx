import React, { useState, useRef } from 'react';
import { Message } from '../../types';
import Modal from '../os/Modal';

interface Props {
  message: Message;
}

export const ImageWithVoiceCard: React.FC<Props> = ({ message }) => {
  const [showImageModal, setShowImageModal] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const imageUrl = message.content;

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center w-48 h-48 bg-slate-100 rounded-xl">
        <span className="text-slate-400 text-sm">图片加载失败</span>
      </div>
    );
  }

  return (
    <>
      <Modal isOpen={showImageModal} onClose={() => setShowImageModal(false)} title="查看图片">
        <div className="flex items-center justify-center p-4">
          <img
            src={imageUrl}
            alt="放大查看"
            className="max-w-full max-h-[70vh] rounded-xl shadow-2xl"
          />
        </div>
      </Modal>

      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg bg-white border border-slate-100"
      >
        <div
          className="relative overflow-hidden rounded-t-2xl cursor-pointer"
          style={{ maxHeight: '240px' }}
          onClick={() => setShowImageModal(true)}
        >
          <img
            src={imageUrl}
            alt="生成的图片"
            className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
            style={{ maxHeight: '240px' }}
          />
          <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1">
            <span className="text-white text-[10px] font-medium">点击放大</span>
          </div>
        </div>
      </div>
    </>
  );
};
