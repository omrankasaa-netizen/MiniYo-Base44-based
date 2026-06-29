import { useLocation } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Home } from 'lucide-react';

export default function PageNotFound() {
    const location = useLocation();
    const { lang, t } = useLang();
    const pageName = location.pathname.substring(1);

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                return { user, isAuthenticated: !!user };
            } catch (error) {
                return { user: null, isAuthenticated: false };
            }
        }
    });
    
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
            <div className="max-w-md w-full">
                <div className="text-center space-y-6">
                    {/* 404 Error Code */}
                    <div className="space-y-2">
                        <h1 className="text-7xl font-light text-muted-foreground">404</h1>
                        <div className="h-0.5 w-16 bg-border mx-auto"></div>
                    </div>
                    
                    {/* Main Message */}
                    <div className="space-y-3">
                        <h2 className="text-2xl font-heading font-bold text-foreground">
                            {t('Page Not Found', 'الصفحة غير موجودة')}
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {t(`The page "${pageName}" could not be found.`, `لم يتم العثور على الصفحة "${pageName}".`)}
                        </p>
                    </div>
                    
                    {/* Admin Note */}
                    {isFetched && authData?.isAuthenticated && authData?.user?.role === 'admin' && (
                        <div className="mt-8 p-4 bg-accent/10 rounded-lg border border-accent/30">
                            <div className="flex items-start gap-3">
                                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                                </div>
                                <div className="text-left space-y-1">
                                    <p className="text-xs font-semibold text-foreground">Admin Note</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {t('This page hasn\'t been implemented yet.', 'لم يتم تنفيذ هذه الصفحة بعد.')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Action Button */}
                    <div className="pt-6">
                        <button 
                            onClick={() => window.location.href = '/'} 
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            <Home className="w-4 h-4" />
                            {t('Go Home', 'الذهاب للرئيسية')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}