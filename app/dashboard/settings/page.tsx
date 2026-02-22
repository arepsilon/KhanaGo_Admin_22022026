import SettingsManager from '@/components/SettingsManager';

export default function SettingsPage() {
    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Settings</h1>
            <SettingsManager />
        </div>
    );
}
